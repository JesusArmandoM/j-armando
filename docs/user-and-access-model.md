# User and Access Model

Project: **J. Armando**. Glossary terms are defined in `../CONTEXT.md`. Split out of `build-brief.md` because identity and photo privacy are product risks here.

## User Types

| Type | Account? | What they can do |
| --- | --- | --- |
| **Guest** | No | Browse, filter, sort, view product detail, run virtual try-on, use the chat assistant, manage a cart, complete checkout. |
| **Customer** | Yes | Everything a guest can do, plus view order history and manage their account. |
| **Admin** | Yes, with `admin` role | Backoffice: manage products, variants, stock and orders. May also be a Customer. |

The buyer and the end user are the same person. There are no organizations, teams, gift purchases or delegated accounts in the MVP.

## Roles

- `customer` — default role granted at account creation.
- `admin` — granted explicitly; gates the backoffice.
- A single account may hold both roles (the shop owner will also be a customer).

Roles are attributes of the account. There is no separate admin user table.

## Permissions

| Capability | Guest | Customer | Admin |
| --- | --- | --- | --- |
| Browse catalog / filters / sorting | ✓ | ✓ | ✓ |
| View product detail | ✓ | ✓ | ✓ |
| Run virtual try-on | ✓ | ✓ | ✓ |
| Use chat assistant | ✓ | ✓ | ✓ |
| Manage a cart | ✓ | ✓ | ✓ |
| Complete checkout | ✓ | ✓ | ✓ |
| View own order history | ✗ | ✓ | ✓ (own) |
| Manage own account | ✗ | ✓ | ✓ |
| Create/edit/publish products & variants | ✗ | ✗ | ✓ |
| Set stock | ✗ | ✗ | ✓ |
| View all orders | ✗ | ✗ | ✓ |
| Move order through fulfillment | ✗ | ✗ | ✓ |

## Ownership Boundaries

- A **cart** is owned by a guest (session-scoped) or by an account. A guest cart is attached to the account at payment confirmation.
- An **order** is always owned by exactly one account (created or linked at payment time). Orders are never anonymous.
- A **conversation** with the chat assistant may be unowned (guest) or owned by an account.
- A **try-on session** and its **photo** may be unowned (guest) or owned by an account.
- Customers can only ever see their own orders. Admin can see all orders.

## Access Rules

- **What grants access:**
  - Customer access is granted by signing in with the account's email.
  - Admin access is granted by the `admin` role on the account.
  - Guest access to browsing, cart and AI features is open with no credentials.
- **What removes access:**
  - Signing out ends the customer session.
  - Revoking the `admin` role removes backoffice access immediately at the next request.
  - Deleting an account removes access and its orders must be retained for legal/accounting reasons but detached from login (see Edge Cases).
- **Does access expire?** Not in the MVP. Sessions expire on the usual client/session policy; there is no time-boxed access or entitlement model.

## Revocation / Expiry

- Revoking `admin` is immediate; it does not delete the account or its order history.
- Revoking a customer account is out of MVP scope (no self-service deletion, no admin deletion flow).
- **Photos uploaded for virtual try-on** are the only asset with a mandatory retention/deletion rule: they must be deletable and must not be retained longer than needed. Exact retention window is an open question.

## Edge Cases

- **Duplicate email at checkout**: the email already has an account. Must prompt sign-in, not create a second account, and must preserve the guest cart through the sign-in.
- **No password set (Quick Access)**: the customer has an account but never chose a password. They must still be able to reach their orders. The sign-in mechanism for this case (magic link, email OTP, forced password creation) is an **open question** and is the highest-risk gap in this model.
- **No email verification**: an account can be created with an email the shopper does not own. Acceptable for the MVP at the user's explicit request, but it is a production risk: order data would be exposed to whoever controls that email. Recorded in `risks-and-open-questions.md`.
- **No password recovery**: a customer who forgets a password cannot self-restore access. For a production store this is a support burden and a security risk. Recorded in `risks-and-open-questions.md`.
- **Guest cart merging**: if a signed-in customer already has a cart and the guest cart has different lines, the merge rule must be defined (union with quantity caps, or replace).
- **Photos of minors**: virtual try-on photos may depict minors. Consent, legal basis and a clear prohibition/guard must be decided before launch.
- **Photo of a third party**: the uploader may not be the person in the photo. Consent text and terms must cover this.
- **Admin is also a customer**: the same account may hold both roles; backoffice and storefront sessions must not leak across each other.
- **Account deletion vs. order history**: accounting/tax rules require keeping order records. Deletion must detach, not erase.
