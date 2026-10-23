# Firestore for data, chosen over Supabase

Workout data lives in Firebase Firestore with Google sign-in. Supabase (Postgres) was the first choice, but its free tier pauses a project after 7 days without activity and needs a manual restore, and the user regularly takes breaks of a week or more; Firestore's free plan never pauses and adds offline persistence for free.

## Considered options

- **Supabase plus a daily keep-alive ping**: rejected because the ping (a scheduled GitHub Action) is itself disabled after 60 days without repo activity, so the failure mode returns.
- **CSV files in OneDrive via Microsoft Graph**: rejected for the Azure app-registration setup and unreliable writes from the phone.

## Consequences

- One document per workout with its sets embedded, so a year of training is a few hundred reads and stays inside the free quota.
- Charts aggregate on the client; there is no SQL. Fine at single-user volume.
