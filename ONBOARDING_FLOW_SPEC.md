# Onboarding Flow Spec — Figma

Status: design-confirmed from screenshots. Implementation must be verified in code.

## Flow

Figma shows 5 steps:

1. Create Account
2. Connect Domain
3. Install Script
4. Customize
5. Run Verification

Stepper behavior:
- completed step: lime circle with checkmark
- active step: black circle with number and underline
- future step: light gray circle
- logo top-left
- Watch Video CTA top-right
- centered white card on light gray page

## Step 1 — Create Account

Only the step indicator is visible in provided screenshots.

Do not invent exact form fields without another screen or code verification.

## Step 2 — Connect Domain

### Domain screen

Title:
- Connect Your Domain

Copy:
- Register your domain (e.g., yourstore.com) inside SourceTrack.

Input:
- Website Domain
- placeholder: ex: google.com

Helper:
- We’ll use ths URL to personalize your set up process

CTA:
- Confirm Domain

### Business type screen

Title:
- Select business type

Subtitle:
- Select your website business type

Options:
- eCommerce
- Saas
- LeadGen/Others

Selected state:
- lime border
- pale lime background
- lime circular icon

CTA:
- Continue

Includes:
- Go Back link

## Step 3 — Install Script

### Installation method screen

Title:
- Install Tracking Script

Subtitle:
- Copy the unique SourceTrack tracking script generated for your website.

Section:
- Choose Installation Method

Options:
- Google Tag Manager
- Standard Installation

Selected state:
- Google Tag Manager selected with lime card treatment

CTA:
- Continue

Includes:
- Go Back link

### GTM instruction screen

Title:
- Install Tracking Script

Section:
- Connect SourceTrack via Google Tag Manager

Copy:
- Easily add SourceTrack to your website using Google Tag Manager (GTM) without editing your site’s code manually.

Steps shown:
1. Log in to your Google Tag Manager account and select your container.
2. Go to Tags → New → Tag Configuration → Custom HTML.
3. Paste your SourceTrack tracking script into the HTML box.
4. Set the trigger to All Pages and save the tag.
5. Click Submit and Publish your container.

Script block:
- Your Tracking Script
- Copy Code action

CTA:
- Continue

Includes:
- Go Back link

## Step 4 — Customize

Title:
- Now customize your dashboard

Copy:
- Since you have added our tracking script now it’s time to customize your dashboard. Data should start flowing within the next few minutes.

Section:
- Configure Conversions

Copy:
- Define what success means for your business. Select or create conversion events to track.

Conversion options:
- Purchase — Track completed transactions and revenue
- Free Trial — Track contact forms and lead generation
- Lead form submission (B2B) — Track contact forms and lead generation
- Sign up — Track contact forms and lead generation
- Schedule a meeting — Track appointment and booking submissions

Selected in screenshot:
- Purchase
- Schedule a meeting

CTA:
- Continue

Includes:
- Go Back link

## Step 5 — Run Verification

### Verification prompt

Title:
- Verify your script.

Copy:
- We need to check whether you’ve placed the script in the correct location or not.

Section:
- Let us Verify SourceTrack Script in GTM

Copy:
- Ensure the SourceTrack script is correctly implemented in Google Tag Manager (GTM) for accurate tracking and data collection.

CTA:
- Run Verification

Includes:
- Go Back link

### Success state

Title:
- Great! Script Verified Successfully

Copy:
- Congratulation, Script is installed & verified successfully. The SourceTrack script has been correctly implemented in GTM. Your tracking setup is now active and functioning properly.

CTA:
- Continue to Dashboard

## Required implementation checks

Before claiming parity:
- verify 5-step route/state exists
- verify domain persists
- verify business type persists
- verify selected business type controls dashboard variant
- verify install method persists
- verify GTM and standard install paths exist
- verify script copy block uses real site key/script
- verify conversion configuration persists
- verify script verification endpoint/flow works
- verify success state
- verify Watch Video CTA
