# Connecting Wandr to Supabase

Until these steps are done, the site keeps working on its own: places come from
`data/wandr.json` and accounts, trips and chat are saved in the visitor's browser.

## 1. Create the project

1. Sign in at supabase.com and click **New project**.
2. Name it `wandr`, choose a strong database password (save it somewhere), and pick the region closest to Ghana.
3. Wait a minute or two for it to finish setting up.

## 2. Build the database

1. In the left sidebar open **SQL Editor** and click **New query**.
2. Open `supabase/schema.sql`, copy everything, paste it in and click **Run**. You should see "Success. No rows returned".
3. Make another new query with everything from `supabase/seed.sql` and click **Run**.
4. Open **Table Editor**. You should see 31 rows in `places`, 15 in `hotels` and 6 in `rooms`.

## 3. Connect the site

1. Open **Project Settings → API** (on newer dashboards: **Project Settings → Data API** and **API Keys**).
2. Copy the **Project URL** and the **anon public** key (newer projects call it the **publishable** key).
3. Paste them into `js/lib/config.js`:

```js
export const SUPABASE_URL = "https://your-project.supabase.co";
export const SUPABASE_ANON_KEY = "your-anon-or-publishable-key";
```

Never paste the **service_role** or **secret** key here. Anything in this file is public.
The anon key is safe to share because the security rules in `schema.sql` decide what each visitor can read and change.

## 4. Tell Supabase where the site lives

1. Open **Authentication → URL Configuration**.
2. Set **Site URL** to your live Vercel address, for example `https://wandr-site.vercel.app`.
3. Under **Redirect URLs** add `https://wandr-site.vercel.app/**` (use your real address).

This is where confirmation and password-reset emails send people back to.

## 5. Email confirmation

By default Supabase emails every new user a link they must click before they can sign in.
While you are testing you can turn this off in **Authentication → Sign In / Providers → Email → Confirm email**.
The free plan only sends a few emails an hour, so keep that in mind when testing.

## 6. Push and test

```
git add . && git commit -m "Connect Supabase" && git push
```

Then on the live site: create an account, mark a place as visited, plan a trip, book a stay and send a chat message.
Each one should appear as a new row in **Table Editor**.

## Good to know

- Free projects pause after about a week without visits. While paused, the site falls back to its built-in list of places and sign-in won't work. Open the project in the dashboard and click **Restore**.
- To change places or hotels, edit the rows in **Table Editor**. The site reads them live.
- If the places table can't be reached, the site uses `data/wandr.json` instead, so keep that file in step with the database.
