# Placement Opportunity Tracker

An intelligent, AI-powered dashboard designed to help college students automatically track job applications, internship opportunities, and interview schedules by scanning and parsing their automated placement emails.

## 💡 Why I Built This

As a college student, managing campus placements can be overwhelming. Between classes, projects, and studying, students often receive hundreds of automated emails from placement cells, recruiters, and job portals. 

It becomes incredibly easy to miss a critical interview scheduling email or lose track of which companies you have applied to. 

I built **Placement Opportunity Tracker** to solve this exact problem. By leveraging the Gmail API and Google's Gemini AI, this application acts as an intelligent assistant that automatically sifts through the noise, extracts the important details, and organizes them into a clean, actionable dashboard so you never miss an opportunity again.

## 🚀 Features

- **Google OAuth Integration:** Securely log in and connect your Gmail account.
- **AI Gatekeeper Filtering:** Uses LLMs to intelligently filter your inbox and only pull emails relevant to job opportunities and placements.
- **Automated Data Extraction:** Automatically extracts the Company Name, Role, Status, and a concise Summary from each email using Gemini AI.
- **Customizable API Keys:** Users can securely enter their own Gemini API keys via the Settings dashboard, ensuring rate limits are never a problem.
- **Google Calendar Sync:** One-click functionality to review AI-extracted dates and instantly schedule interviews to your Google Calendar.
- **Dashboard & Analytics:** View key statistics (Total Applications, Shortlists, Interviews) at a glance.

## 🛠 Tech Stack

- **Framework:** Next.js 13+ (App Router)
- **Styling:** CSS Modules with a custom Glassmorphism UI
- **Database:** SQLite with Prisma ORM
- **Authentication:** NextAuth.js
- **AI / LLM:** Google `@google/genai` (Gemini 2.5 Flash)
- **Integrations:** Gmail API, Google Calendar API

## 📋 Setup & Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/sohamac/placement-oppurtunity-tracker.git
   cd placement-oppurtunity-tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your `.env` file with the required credentials:
   ```env
   NEXTAUTH_SECRET="your-secret"
   NEXTAUTH_URL="http://localhost:3000"
   GOOGLE_CLIENT_ID="your-google-oauth-client-id"
   GOOGLE_CLIENT_SECRET="your-google-oauth-client-secret"
   ```

4. Push the database schema:
   ```bash
   npx prisma db push
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

## 📜 License

This project is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).
