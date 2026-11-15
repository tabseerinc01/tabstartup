import { NextRequest } from 'next/server';

import {
  readRegistrationAccess,
} from '@/lib/event-registration-access';

import {
  requireRegistrationEnabled,
  registrationApiFailure,
  RegistrationApiError,
} from '@/lib/event-registration-api';

import {
  consumeEventRegistrationAttempt,
} from '@/services/event-registration-rate-limit.service';

import {
  getAuthorizedEventOrder,
} from '@/services/event-order-access.service';

import {
  generateEventTicketPdf,
} from '@/services/event-ticket-pdf.service';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      orderId: string;
      ticketId: string;
    }>;
  }
) {
  try {
    requireRegistrationEnabled();

    await consumeEventRegistrationAttempt(
      request,
      'order_status'
    );

    const access =
      readRegistrationAccess(request);

    const { orderId, ticketId } =
      await context.params;

    if (
      !/^ticket_[a-f0-9]{64}$/.test(ticketId)
    ) {
      throw new RegistrationApiError(
        404,
        'TICKET_NOT_FOUND'
      );
    }

    const order =
      await getAuthorizedEventOrder(
        orderId,
        access,
        { includeTicketEvent: true }
      );

    if (
      order.status !== 'fulfilled' ||
      !order.ticketEvent
    ) {
      throw new RegistrationApiError(
        409,
        'TICKET_UNAVAILABLE'
      );
    }

    const ticket = order.tickets.find(
      item => item.ticketId === ticketId
    );

    if (!ticket) {
      throw new RegistrationApiError(
        404,
        'TICKET_NOT_FOUND'
      );
    }

    const event = order.ticketEvent;
    const item = order.items[0];

    const pdf = await generateEventTicketPdf({
      eventTitle: event.title,
      startsAtMs: event.startsAtMs,
      endsAtMs: event.endsAtMs,
      timezone: event.timezone,
      venue: event.venue,

      participantName:
        ticket.participantName,

      ticketName: ticket.ticketName,

      ticketNumber: ticket.ticketNumber,

      attendanceMode:
        ticket.attendanceMode,

      currency: order.currency,

      unitAmountMinor:
        item.unitAmountMinor,

      status: ticket.status,

      issuedAtMs: ticket.issuedAtMs,
    });

    return new Response(
      new Uint8Array(pdf),
      {
        status: 200,

        headers: {
          'Content-Type':
            'application/pdf',

          'Content-Disposition':
            'attachment; filename="TabStartup-' +
            ticket.ticketNumber +
            '.pdf"',

          'Content-Length':
            String(pdf.length),

          'Cache-Control':
            'private, no-store, max-age=0',

          'Vary':
            'Authorization, Cookie',

          'X-Content-Type-Options':
            'nosniff',

          'X-Robots-Tag':
            'noindex, nofollow, noarchive',

          'Referrer-Policy':
            'no-referrer',
        },
      }
    );
  } catch (error) {
    return registrationApiFailure(error);
  }
}
