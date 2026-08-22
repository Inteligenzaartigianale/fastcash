---
name: Commercial license device identity
description: Rules for binding a commercial license to one installation without carrying ADE credentials.
---

A commercial license must be bound to a device-generated, non-exportable signing key rather than only to a browser identifier or a localStorage value. The server stores the registered public key and accepts fiscal-license checks only when the device supplies a fresh valid signature.

**Why:** A client-controlled device ID or static bearer value can be copied to a second installation, defeating the one-device commercial entitlement. ADE cookies and credentials must remain entirely separate from the license transfer.

**How to apply:** Preserve this signature-based identity when changing device authentication, implementing the PAX native app, or adding the future ADE REST connector. On PAX, use the platform keystore for the equivalent private key. License transfers authorize a newly registered public key via the temporary QR and PIN flow; they do not move ADE session data.