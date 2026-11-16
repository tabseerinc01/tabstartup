import 'server-only';

import path from 'node:path';

import PdfPrinter from 'pdfmake';

import type {
  TDocumentDefinitions,
} from 'pdfmake/interfaces';

export interface EventTicketPdfInput {
  eventTitle: string;
  startsAtMs: number;
  endsAtMs: number;
  timezone: string;
  venue: string | null;

  participantName: string;
  ticketName: string;
  ticketNumber: string;

  attendanceMode: 'online' | 'offline';

  currency: 'BDT' | 'USD' | null;
  unitAmountMinor: number;

  status: 'issued' | 'checked_in';

  issuedAtMs: number;
}

function formatDate(
  milliseconds: number,
  timezone: string
): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(milliseconds);
}

function formatAmount(
  amountMinor: number,
  currency: EventTicketPdfInput['currency']
): string {
  if (currency === null) {
    return 'Free';
  }

  return (
    currency + ' ' +
    (amountMinor / 100).toFixed(2)
  );
}

function validateText(
  value: unknown,
  maximum: number
): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function validateTimestamp(
  value: number
): boolean {
  return (
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 253402300799999
  );
}

function validateInput(
  input: EventTicketPdfInput
): void {
  if (
    !validateText(input.eventTitle, 300) ||
    !validateText(input.participantName, 200) ||
    !validateText(input.ticketName, 200) ||
    !/^TS-[A-F0-9]{64}$/.test(
      input.ticketNumber
    ) ||
    !validateText(input.timezone, 100) ||
    (
      input.venue !== null &&
      !validateText(input.venue, 1500)
    ) ||
    !validateTimestamp(input.startsAtMs) ||
    !validateTimestamp(input.endsAtMs) ||
    !validateTimestamp(input.issuedAtMs) ||
    input.endsAtMs <= input.startsAtMs ||
    (
      input.attendanceMode !== 'online' &&
      input.attendanceMode !== 'offline'
    ) ||
    (
      input.attendanceMode === 'offline' &&
      input.venue === null
    ) ||
    (
      input.status !== 'issued' &&
      input.status !== 'checked_in'
    ) ||
    !Number.isSafeInteger(input.unitAmountMinor) ||
    input.unitAmountMinor < 0 ||
    (
      input.currency !== null &&
      input.currency !== 'BDT' &&
      input.currency !== 'USD'
    ) ||
    (
      input.currency === null &&
      input.unitAmountMinor !== 0
    )
  ) {
    throw new Error('INVALID_TICKET_PDF_INPUT');
  }
}

export async function generateEventTicketPdf(
  input: EventTicketPdfInput
): Promise<Buffer> {
  validateInput(input);

  const fontPath = path.join(
    process.cwd(),
    'src/assets/pdf-fonts/NotoSansBengali.ttf'
  );

  const logoPath = path.join(
    process.cwd(),
    'public/brand/tabstartup-logo.png'
  );

  const printer = new PdfPrinter({
    TicketFont: {
      normal: fontPath,
      bold: fontPath,
      italics: fontPath,
      bolditalics: fontPath,
    },
  });

  const document: TDocumentDefinitions = {
    pageSize: 'A5',

    pageMargins: [28, 28, 28, 38],

    info: {
      title: 'TabStartup Event Admission Ticket',
      author: 'TabStartup',
      subject: 'Event registration confirmation',
      creationDate: new Date(input.issuedAtMs),
    },

    defaultStyle: {
      font: 'TicketFont',
      fontSize: 10,
      color: '#172033',
      lineHeight: 1.15,
    },

    content: [
      {
        image: logoPath,
        fit: [145, 45],
        margin: [0, 0, 0, 12],
      },

      {
        text: 'OFFICIAL EVENT ADMISSION TICKET',
        fontSize: 9,
        color: '#475569',
        margin: [0, 0, 0, 8],
      },

      {
        text: input.eventTitle,
        fontSize: 21,
        color: '#173B80',
        margin: [0, 0, 0, 10],
      },

      {
        text:
          input.status === 'checked_in'
            ? 'CHECKED IN'
            : 'REGISTRATION CONFIRMED',
        color: '#15803D',
        fontSize: 11,
        margin: [0, 0, 0, 15],
      },

      {
        table: {
          widths: ['*'],
          body: [[{
            stack: [
              {
                text: 'Event starts',
                style: 'label',
              },
              {
                text: formatDate(
                  input.startsAtMs,
                  input.timezone
                ),
                margin: [0, 2, 0, 8],
              },
              {
                text: 'Event ends',
                style: 'label',
              },
              {
                text: formatDate(
                  input.endsAtMs,
                  input.timezone
                ),
                margin: [0, 2, 0, 8],
              },
              {
                text: 'Timezone: ' + input.timezone,
                fontSize: 9,
                margin: [0, 0, 0, 8],
              },
              {
                text: 'Venue / attendance',
                style: 'label',
              },
              {
                text:
                  input.attendanceMode === 'online'
                    ? 'Online event'
                    : input.venue!,
                margin: [0, 2, 0, 0],
              },
            ],
            fillColor: '#F1F5F9',
            margin: [9, 9, 9, 9],
          }]],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 14],
      },

      {
        text: 'Participant',
        style: 'label',
      },

      {
        text: input.participantName,
        fontSize: 17,
        margin: [0, 3, 0, 12],
      },

      {
        columns: [
          {
            width: '*',
            stack: [
              {
                text: 'Ticket category',
                style: 'label',
              },
              {
                text: input.ticketName,
                margin: [0, 3, 0, 0],
              },
            ],
          },
          {
            width: '*',
            stack: [
              {
                text: 'Registration fee',
                style: 'label',
              },
              {
                text: formatAmount(
                  input.unitAmountMinor,
                  input.currency
                ),
                margin: [0, 3, 0, 0],
              },
            ],
          },
        ],
        columnGap: 12,
        margin: [0, 0, 0, 14],
      },

      {
        text: 'Unique ticket number',
        style: 'label',
      },

      {
        text: [
          input.ticketNumber.slice(0, 35),
          input.ticketNumber.slice(35),
        ].join('\n'),
        fontSize: 10,
        color: '#173B80',
        margin: [0, 4, 0, 12],
      },

      {
        text: 'Issued: ' + formatDate(
          input.issuedAtMs,
          input.timezone
        ),
        fontSize: 8,
        color: '#64748B',
        margin: [0, 0, 0, 10],
      },

      {
        text:
          'This ticket is non-transferable and valid ' +
          'only for the named participant. ' +
          'Identity and registration status may be verified. ' +
          'Each ticket permits one admission only.',
        fontSize: 9,
        color: '#475569',
      },
    ],

    styles: {
      label: {
        fontSize: 9,
        color: '#64748B',
      },
    },

    footer: {
      text: 'Organized by TabStartup | tabstartup.com',
      alignment: 'center',
      fontSize: 8,
      color: '#64748B',
      margin: [20, 10, 20, 0],
    },
  };

  return new Promise<Buffer>(
    (resolve, reject) => {
      const chunks: Buffer[] = [];

      const pdf = printer.createPdfKitDocument(
        document
      );

      pdf.on('data', chunk => {
        chunks.push(Buffer.from(chunk));
      });

      pdf.on('error', reject);

      pdf.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      pdf.end();
    }
  );
}
