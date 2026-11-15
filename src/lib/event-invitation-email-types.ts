import type {
  EventEmailOutboxRecord,
} from '@/lib/event-email-types';

import type {
  EventInvitationEmailTemplateInput,
} from '@/services/email/event-invitation-email-template.service';

export type EventInvitationEmailTrigger =
  | 'invitation_created'
  | 'invitation_renewed';

export interface EventInvitationEmailOutboxRecord
  extends Omit<
    EventEmailOutboxRecord,
    'orderId' |
    'type' |
    'trigger' |
    'templateInput'
  > {
  orderId: null;

  invitationId: string;

  tokenVersion: number;

  type: 'event_invitation';

  trigger: EventInvitationEmailTrigger;

  templateInput:
    EventInvitationEmailTemplateInput;
}

export type AnyEventEmailOutboxRecord =
  | EventEmailOutboxRecord
  | EventInvitationEmailOutboxRecord;

export function isEventInvitationEmailJob(
  job: AnyEventEmailOutboxRecord
): job is EventInvitationEmailOutboxRecord {
  return job.type === 'event_invitation';
}
