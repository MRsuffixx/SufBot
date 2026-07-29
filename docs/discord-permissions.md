# Discord permissions for onboarding

Required capabilities depend on enabled features:

- verification setup: Manage Channels and Manage Roles;
- message delivery: View Channel, Send Messages, Embed Links, Read Message History;
- captcha/card attachments: Attach Files;
- optional message cleanup: Manage Messages where channel policy requires it;
- automatic roles: Manage Roles with the bot's highest role above every target;
- existing-member migration: Guild Members intent plus Manage Roles.

Setup checks the initiating user and the bot twice: before queueing from dashboard/API and again in
the bot immediately before Discord mutation. Runtime diagnostics inspect effective permissions even
when an installation was granted Administrator. Administrator is not treated as a substitute for
role hierarchy: Discord still prevents managing equal/higher and managed roles.

Do not move verified/unverified/automatic roles above the bot. Do not delete configured resources to
"reset" setup; deletion intentionally marks health broken and repair preserves evidence.
