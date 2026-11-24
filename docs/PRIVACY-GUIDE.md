# Privacy: a guide for the family admin

A family tree is one of the most sensitive things you can put online. It lists who is related to whom, where people come from, when they were born, and often their phone numbers, photos and children. In the wrong hands that is everything a scammer needs: "Hello, I'm calling from the bank about your mother's account, can you confirm her maiden name and date of birth?"

So privacy isn't a feature of this website. It's the reason it exists. Here's what the site does for you, and what only you can do.

## What the website does

- **Nothing is public.** Someone who isn't signed in sees only the sign-in page. Someone who signs in without an invitation sees only a form to ask to join.
- **Each person controls their own details.** Every detail (phone, city, birthday, photo) is *Family*, *Close family* or *Only me*. Nothing about a living person shows until they agree to the family's privacy declaration, and they can withdraw that at any time.
- **Children are protected.** No phone, email or address is ever kept for anyone under 18. A parent approves everything a child posts. Children aren't tracked (no "online now").
- **The rules live in the database**, not just in the screens, so they hold even if someone tries to get around the website. Over 500 automated tests check them.
- **Every change is logged**, so you can see who changed what.
- **Photos are private**: kept in a private store, shown through links that expire in 10 minutes, with the location data removed from them.
- **Data stays with your family.** Your copy runs on your accounts. This project, its authors and every other family using it can't see your data.
- **Admins need 2-step sign-in.** Admins can see more than anyone else, so they must use an authenticator app.
- **Old data is cleaned up**: decided join requests, unused invitations and old logs are deleted on a schedule (listed in your site's privacy notice).

## What only you can do

1. **Keep your copy of the code private** on GitHub. Your settings and backups live with it.
2. **Never put the secret key in a file.** The Supabase secret key goes only into the Worker's and GitHub's secret settings.
3. **Turn on 2-step sign-in** on every account that runs the site: GitHub, Cloudflare, Supabase, Google, Resend. Write the recovery codes down on paper.
4. **Have a second admin.** If you lose your phone or move away, someone else must be able to keep the site running. Add a trusted relative as a second admin from day one.
5. **Choose stewards carefully.** Stewards approve who joins. One or two per branch, people the branch trusts.
6. **Check before you approve.** When someone asks to join, make sure you know who they are, ideally by a phone call. Never approve a stranger "because they have the same surname".
7. **Don't import phone numbers or addresses.** The spreadsheet importer skips them on purpose. Let each person add their own and choose who sees them.
8. **Be careful with photos of children.** Ask the parents first.
9. **Set the backup passphrase and keep it offline.** Backups are encrypted with it; without it they can't be opened, and with it anyone can.
10. **Respond to requests.** If someone asks what you hold about them, or asks you to delete it, do it. They can clear their own details on their profile at any time; an admin removes the rest.

## India's data protection law (DPDP Act)

If your website is only for your own family, it is very likely a personal or domestic use. Even so, the site is built to the DPDP Act's standards (consent, children's data, a way to ask questions, deletion, retention periods), because that's the right way to treat relatives' data anyway.

If you run the site for a community association, a trust, or for families other than your own, or charge for it, you may become a "data fiduciary" with legal duties under the DPDP Act and its 2025 Rules (most of which apply from May 2027). Take advice from a lawyer before you do that. This guide is not legal advice.

## If something goes wrong

- **A stranger got in:** suspend them in Admin → Members & roles, check the change log, and tell the family.
- **A key leaked:** create a new secret key in Supabase, put it in the Worker and GitHub secrets, and delete the old one.
- **You lost your 2-step phone:** another admin removes your 2-step in Supabase → Authentication → Users, then you set it up again.
- **Someone wants to leave:** they can clear their details on their profile and withdraw consent; an admin removes their sign-in.
