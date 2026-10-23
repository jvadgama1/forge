# Public repo; personal data never enters it

The repo is public on GitHub because free GitHub Pages hosting requires it, and the code contains nothing sensitive. Workout data, the coach profile and coach output live only in Firestore behind security rules that allow the user's account alone.

## Consequences

- Never commit personal data, exports, `.env` files or service-account keys; `.gitignore` guards the common patterns.
- The Firebase web config in the app is public by design; Firestore security rules are what protect the data, so rule changes get tests and review like code.
- Issues and pull requests are public too: describe bugs with made-up data.
