-- Rezygnacja z SMS (decyzja właściciela 2026-10-16): kanały powiadomień to push i e-mail.
delete from public.notification_log where channel = 'sms';

alter table public.notification_log drop constraint notification_log_channel_check;
alter table public.notification_log
  add constraint notification_log_channel_check check (channel in ('push', 'email'));

alter table public.notification_preferences drop column sms;
