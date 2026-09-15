# Password Reset Screens - Visual Guide

## 1. Login Screen (Updated)

```
┌─────────────────────────────────────┐
│                                     │
│         [Aflon Logo]                │
│   Attendance Management System      │
│                                     │
│  ┌───────────────────────────────┐ │
│  │                               │ │
│  │  Sign In                      │ │
│  │  Enter your credentials       │ │
│  │                               │ │
│  │  Email Address                │ │
│  │  ┌─────────────────────────┐ │ │
│  │  │ you@example.com         │ │ │
│  │  └─────────────────────────┘ │ │
│  │                               │ │
│  │  Password    Forgot Password? │ │  ← NEW!
│  │  ┌─────────────────────────┐ │ │
│  │  │ ••••••••                │ │ │
│  │  └─────────────────────────┘ │ │
│  │                               │ │
│  │  ┌─────────────────────────┐ │ │
│  │  │      Sign In            │ │ │
│  │  └─────────────────────────┘ │ │
│  │                               │ │
│  │  Don't have an account?       │ │
│  │      Create Account           │ │
│  │                               │ │
│  └───────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

**Changes:**
- Added "Forgot Password?" link next to password label
- Link is styled in primary blue color
- Tappable and navigates to forgot password screen

---

## 2. Forgot Password Screen (New)

```
┌─────────────────────────────────────┐
│  ← Back                             │
│                                     │
│         [Aflon Logo]                │
│   Attendance Management System      │
│                                     │
│  ┌───────────────────────────────┐ │
│  │                               │ │
│  │      ┌─────────┐              │ │
│  │      │  🔒     │              │ │
│  │      └─────────┘              │ │
│  │                               │ │
│  │  Forgot Password?             │ │
│  │                               │ │
│  │  Enter your email address     │ │
│  │  and we'll send you a link    │ │
│  │  to reset your password.      │ │
│  │                               │ │
│  │  Email Address                │ │
│  │  ┌─────────────────────────┐ │ │
│  │  │ you@example.com         │ │ │
│  │  └─────────────────────────┘ │ │
│  │                               │ │
│  │  ┌─────────────────────────┐ │ │
│  │  │   Send Reset Link       │ │ │
│  │  └─────────────────────────┘ │ │
│  │                               │ │
│  │  Remember your password?      │ │
│  │      Back to Sign In          │ │
│  │                               │ │
│  └───────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

**Features:**
- Back button in top-left corner
- Lock icon in circular badge
- Clear instructions
- Email input field
- Send button with loading state
- Link back to login

---

## 3. Reset Password Screen (New)

```
┌─────────────────────────────────────┐
│  ← Back                             │
│                                     │
│         [Aflon Logo]                │
│   Attendance Management System      │
│                                     │
│  ┌───────────────────────────────┐ │
│  │                               │ │
│  │      ┌─────────┐              │ │
│  │      │  🔑     │              │ │
│  │      └─────────┘              │ │
│  │                               │ │
│  │  Reset Password               │ │
│  │                               │ │
│  │  Enter your new password      │ │
│  │  below.                       │ │
│  │                               │ │
│  │  New Password                 │ │
│  │  ┌─────────────────────────┐ │ │
│  │  │ Min. 8 characters    👁 │ │ │  ← Toggle
│  │  └─────────────────────────┘ │ │
│  │                               │ │
│  │  Confirm Password             │ │
│  │  ┌─────────────────────────┐ │ │
│  │  │ Re-enter password    👁 │ │ │  ← Toggle
│  │  └─────────────────────────┘ │ │
│  │                               │ │
│  │  ┌─────────────────────────┐ │ │
│  │  │   Reset Password        │ │ │
│  │  └─────────────────────────┘ │ │
│  │                               │ │
│  │      Back to Sign In          │ │
│  │                               │ │
│  └───────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

**Features:**
- Back button in top-left corner
- Key icon in circular badge
- Two password fields
- Eye icons to show/hide passwords
- Password validation (min. 8 chars)
- Confirmation matching
- Reset button with loading state
- Link back to login

---

## User Journey

### Scenario: User Forgot Password

**Step 1: Login Screen**
```
User sees: "Forgot Password?" link
Action: Taps link
```

**Step 2: Forgot Password Screen**
```
User sees: Email input field
Action: Enters email → Taps "Send Reset Link"
Result: "Email Sent" alert appears
```

**Step 3: Email**
```
User receives: Email with reset link
Action: Taps link in email
Result: App opens to Reset Password screen
```

**Step 4: Reset Password Screen**
```
User sees: New password fields
Action: Enters new password → Confirms → Taps "Reset Password"
Result: "Success" alert → Redirected to login
```

**Step 5: Login Screen**
```
User sees: Login form
Action: Logs in with new password
Result: Successfully authenticated
```

---

## Design Elements

### Colors
- **Primary**: `#003366` (Navy Blue)
- **Background**: Semi-transparent navy overlay on school image
- **Text**: White on dark background, dark on light cards
- **Accent**: Primary blue for links and buttons

### Icons
- **Forgot Password**: Lock icon (🔒)
- **Reset Password**: Key icon (🔑)
- **Show/Hide**: Eye icons (👁 / 👁‍🗨)
- **Back**: Arrow icon (←)

### Typography
- **Title**: Bold, 24px
- **Subtitle**: Regular, 14px, muted
- **Labels**: Bold, 12px, uppercase
- **Links**: Bold, 16px, primary color

### Spacing
- **Card Padding**: 32px
- **Input Spacing**: 16px between fields
- **Button Margin**: 16px top
- **Section Spacing**: 24px

### Animations
- **Loading**: Spinner in button
- **Transitions**: Smooth navigation
- **Keyboard**: Avoiding view for inputs

---

## Validation Messages

### Forgot Password
- ❌ "Please enter your email address."
- ❌ "Please enter a valid email address."
- ❌ "Email Not Found" - "No account exists with this email address. Please check and try again."
- ❌ "Connection Error" - "Unable to connect to the server. Please check your internet connection."
- ✅ "Success!" - "Password reset link has been sent to your email. Please check your inbox."

### Reset Password
- ❌ "Please fill in all fields."
- ❌ "Password must be at least 8 characters long."
- ❌ "Passwords do not match."
- ❌ "This reset link has expired or is invalid."
- ✅ "Your password has been reset successfully."

---

## Accessibility

### Screen Readers
- All inputs have labels
- Buttons have descriptive text
- Icons have accessible names
- Errors are announced

### Touch Targets
- Minimum 44x44 points
- Adequate spacing between elements
- Large, easy-to-tap buttons

### Keyboard
- Tab order is logical
- Return key submits forms
- Keyboard dismisses appropriately

---

## Platform Differences

### iOS
- Uses native keyboard avoiding
- Smooth animations
- System fonts
- Native alerts

### Android
- Material Design ripples
- Android keyboard handling
- System fonts
- Native alerts

Both platforms have identical functionality and similar appearance!
