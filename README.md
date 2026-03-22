# GoldJournal: Mobile-First Trading Dashboard

A powerful, offline-capable trading journal and performance analytics dashboard specifically optimized for professional forex tracking with full raw MT5 log integration. 

Built entirely with React, TypeScript, TailwindCSS v4, and Dexie (IndexedDB).

## Core Features

- **📱 Mobile First Interface**: Features a comfortable, thumb-friendly bottom navigation bar for mobile setups that automatically expands into a sidebar dashboard for desktop viewports.
- **💾 Offline Database**: Powered by IndexedDB (`Dexie.js`). The entire application runs natively within your browser without requiring a backend server. Your highly-sensitive journal data never leaves your local machine.
- **💼 Multi-Currencies / Accounts**: Effortlessly isolate performance datasets. Toggling between accounts (e.g., your USD broker account vs your IDR account) immediately sandboxes your balances, trade logs, and charts.
- **📥 Sync Data & MT5 Parser**: Never type trades manually again. Directly paste raw tab-separated logs from MT5 to automatically trace entries, exits, lot calculations, and top-ups mathematically back into JSON. Intelligent anti-duplicate mechanisms skip previously recorded trades ensuring you never bloat your metrics upon re-importing!
- **🧾 Comprehensive Trade History**: Dive deep into your journal log. Features powerful `date-fns` powered filters allowing custom date periods, sorting by 'Profit/Loss', or isolating positive outcomes to review setups.
- **📈 Advanced Analytics**: Instant computation of win-rates, average losses vs average wins, coupled with a dynamic chronological equity chart representing drawdowns that perfectly adjust when fresh deposits or withdrawals are logged!

## Getting Started

Because the application requires zero external servers, getting it running locally is incredibly fast. 

1. Ensure you have `pnpm` currently installed.
2. Open a terminal and clone exactly into the root project directory.
3. Install package dependencies:
   ```bash
   pnpm install
   ```
4. Start the development server:
   ```bash
   pnpm run dev
   ```
   Navigate to the localhost URL emitted in your terminal (usually `http://localhost:5173`)! 

## Tech Stack
- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS v4
- **Database**: Dexie.js (IndexedDB wrapper)
- **Charts**: Recharts
- **Dates**: `date-fns`
- **Icons**: Lucide React
