import 'server-only';

import {
  Timestamp,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

import {
  EVENT_COLLECTIONS,
  type PersistedEventOrder,
} from '@/lib/event-types';

import {
  type EventEmailOutboxRecord,
} from '@/lib/event-email-types';

import {
  readConfirmedEventTickets,
} from '@/services/event-confirmed-ticket-reader.service';

import {
  generateEventTicketPdf,
  type EventTicketPdfInput,
} from '@/services/event-ticket-pdf.service';

import {
  checkEventEmailEligibility,
} from './event-email-eligibility.service';

import {
  type EmailPdfAttachment,
} from './resend-email.service';

const MAX_TICKETS = 20;

const MAX_PDF_BYTES = 1024 * 1024;

const MAX_TOTAL_PDF_BYTES = 8 * 1024 * 1024;

/**
 * Read canonical ticket inputs.
 *
 * No writes, PDF generation or provider calls
 * are performed inside this transaction.
 */
export async function readConfirmedEmailTicketInputs(
  tx: Transaction,
  db: Firestore,
  job: EventEmailOutboxRecord,
  now: Timestamp
): Promise<EventTicketPdfInput[]> {
  if (job.type !== 'registration_confirmed') {
    throw new Error('INVALID_TICKET_EMAIL_TYPE');
  }

  const eligibility =
    await checkEventEmailEligibility(
      tx,
      db,
      job,
      now
    );

  if (!eligibility.eligible) {
    throw new Error('TICKET_EMAIL_NOT_ELIGIBLE');
  }

  const orderSnap = await tx.get(
    db.collection(EVENT_COLLECTIONS.orders)
      .doc(job.orderId)
  );

  if (!orderSnap.exists) {
    throw new Error('TICKET_EMAIL_ORDER_MISSING');
  }

  const order =
    orderSnap.data() as PersistedEventOrder;

  if (
    order.orderId !== job.orderId ||
    order.eventId !== job.eventId ||
    order.purchaserEmail !== job.recipientEmail ||
    order.status !== 'fulfilled'
  ) {
    throw new Error('TICKET_EMAIL_ORDER_MISMATCH');
  }

  const confirmed =
    await readConfirmedEventTickets(
      tx,
      db,
      order,
      { includeTicketEvent: true }
    );

  const event = confirmed.ticketEvent;

  if (
    !event ||
    confirmed.tickets.length < 1 ||
    confirmed.tickets.length > MAX_TICKETS ||
    confirmed.tickets.length !==
      order.items[0].quantity
  ) {
    throw new Error('INVALID_CONFIRMED_TICKETS');
  }

  return confirmed.tickets.map(
    (ticket): EventTicketPdfInput => ({
      eventTitle: event.title,
      startsAtMs: event.startsAtMs,
      endsAtMs: event.endsAtMs,
      timezone: event.timezone,
      venue: event.venue,

      participantName: ticket.participantName,
      ticketName: ticket.ticketName,
      ticketNumber: ticket.ticketNumber,
      attendanceMode: ticket.attendanceMode,

      currency: confirmed.currency,
      unitAmountMinor: confirmed.unitAmountMinor,

      // Preserve the original admission document
      // even if check-in status changes later.
      status: 'issued',

      issuedAtMs: ticket.issuedAtMs,
    })
  );
}

/**
 * Generate PDFs outside Firestore transactions.
 *
 * Never persist PDF bytes in Firestore.
 */
export async function generateConfirmedEmailAttachments(
  inputs: EventTicketPdfInput[]
): Promise<EmailPdfAttachment[]> {
  if (
    inputs.length < 1 ||
    inputs.length > MAX_TICKETS
  ) {
    throw new Error('INVALID_TICKET_ATTACHMENT_COUNT');
  }

  const attachments: EmailPdfAttachment[] = [];
  const numbers = new Set<string>();

  let totalBytes = 0;

  for (const input of inputs) {
    if (
      numbers.has(input.ticketNumber) ||
      !/^TS-[A-F0-9]{64}$/.test(
        input.ticketNumber
      )
    ) {
      throw new Error('INVALID_TICKET_ATTACHMENT_ID');
    }

    const pdf =
      await generateEventTicketPdf(input);

    if (
      pdf.length < 5 ||
      pdf.length > MAX_PDF_BYTES ||
      pdf.subarray(0, 5).toString('ascii') !== '%PDF-'
    ) {
      throw new Error('INVALID_TICKET_ATTACHMENT_PDF');
    }

    totalBytes += pdf.length;

    if (totalBytes > MAX_TOTAL_PDF_BYTES) {
      throw new Error('TICKET_ATTACHMENT_SIZE_LIMIT');
    }

    numbers.add(input.ticketNumber);

    attachments.push({
      filename:
        'TabStartup-Ticket-' +
        input.ticketNumber +
        '.pdf',

      content: pdf.toString('base64'),
    });
  }

  return attachments;
}
