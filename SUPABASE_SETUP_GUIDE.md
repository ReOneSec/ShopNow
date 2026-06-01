# Supabase Setup Guide — Enable Email OTP for Sign Up

Hey! We've added a new sign-up flow to the app that verifies users via a **6-digit OTP code** sent to their email. For this to work, you need to make a few changes in the Supabase Dashboard.

It should take **~5 minutes**.

---

## Step 1: Enable Email Confirmation

1. Go to **Supabase Dashboard** → your project
2. Navigate to **Authentication** → **Providers** (left sidebar)
3. Click on **Email**
4. Make sure these are enabled:
   - ✅ **Enable Email provider** → ON
   - ✅ **Confirm email** → ON ← **This is the most important one**

> Without "Confirm email" turned ON, Supabase will auto-confirm users and skip the OTP entirely.

---

## Step 2: Update the Sign-Up Email Template

By default, Supabase sends a **magic link** for email confirmation. We need it to send a **6-digit code** instead.

1. Go to **Authentication** → **Email Templates**
2. Click on the **Confirm signup** template
3. **Replace the entire body** with this:

**Subject:**
```
Your ShopNow verification code
```

**Body (HTML):**
```html
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #7C3AED, #6D28D9); border-radius: 16px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
      <span style="font-size: 32px;">🔒</span>
    </div>
    <h2 style="margin: 0; color: #1a1a2e; font-size: 24px;">Verify your email</h2>
  </div>

  <p style="color: #555; font-size: 15px; line-height: 1.6; text-align: center;">
    Enter this code in the app to complete your registration:
  </p>

  <div style="text-align: center; margin: 24px 0;">
    <div style="display: inline-block; background: #f4f0ff; border: 2px solid #7C3AED; border-radius: 12px; padding: 16px 32px;">
      <span style="font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #7C3AED;">{{ .Token }}</span>
    </div>
  </div>

  <p style="color: #999; font-size: 13px; text-align: center;">
    This code expires in <strong>60 minutes</strong>.<br>
    If you didn't create an account, you can safely ignore this email.
  </p>
</div>
```

4. Click **Save**

> `{{ .Token }}` is a Supabase variable — it gets replaced with the actual 6-digit code. **Do not change it.**

---

## Step 3: Set OTP Expiry (Optional but Recommended)

1. Go to **Authentication** → **Settings** (or **Auth Settings**)
2. Find **OTP Expiry** (or "Mailer OTP Expiration")
3. Set it to your preference:
   - Default: `3600` seconds (60 minutes)
   - Recommended: `600` seconds (10 minutes) for better security

---

## Step 4: Check Rate Limits (Optional)

To prevent abuse:

1. Go to **Authentication** → **Rate Limits**
2. Recommended settings:
   - **Rate limit for sending emails**: `3` per `3600` seconds (3 per hour per email)

---

## That's It! ✅

Once you've done the above, the flow works like this:

```
User enters email + password in app
        ↓
App calls supabase.auth.signUp()
        ↓
Supabase sends the 6-digit code to user's email
        ↓
User enters the code in the app
        ↓
App calls supabase.auth.verifyOtp()
        ↓
Account is created and verified ✅
```

---

## Quick Checklist

- [ ] Email provider enabled
- [ ] "Confirm email" is ON
- [ ] Sign-up email template updated with `{{ .Token }}`
- [ ] OTP expiry set (optional)
- [ ] Rate limits configured (optional)

If anything doesn't work, the most common issue is **"Confirm email" being turned OFF** — double-check that first.
