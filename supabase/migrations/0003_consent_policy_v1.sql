-- Version 1 of the consent declaration. To change the wording, add a new
-- version in a new migration: everyone is then asked to agree again.
insert into public.policy_versions (version, body) values (1, $txt$
This site is private. Only invited family members who sign in can see it.

By continuing, I confirm that:

1. I am the person named on this profile, or their parent or guardian.
2. I'm happy for my name and relationships to be shown to signed-in family members, and my photo if I choose to show it.
3. Anything else I add will be shown only at the visibility I choose. I can change or remove it at any time.
4. I will only upload photos and stories about other people that I have the right to share.
5. The family admins can see my details to keep the site running. They will not share them outside the family or use them for anything else.
6. I can withdraw this consent and ask for my information to be deleted at any time from My privacy.
$txt$);
