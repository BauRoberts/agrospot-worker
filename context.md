Here's a concise project documentation for the Agrospot Platform:

Some rules:

- Always try to ask for files before coding
- If u think that some file or command would give u more context and makes u code better, ask it.
- First lets make it work, then, lets make it pretty.

# Agrospot Platform Documentation

# User Flow Overview

# Buyer Journey

A buyer interested in agricultural products can immediately access Agrospot's public quotation form without needing to create an account or log in. Through this straightforward form, they specify their needs: the type of product (e.g., soybeans, corn), desired quantity in tons, and their location. After submitting the quotation, Agrospot's background processing system springs into action, analyzing all available opportunities in the market. Within minutes, the buyer receives a detailed email notification containing the best commercial matches, each listing showing key information like price per ton, transportation costs, payment terms, and most importantly - the comparative advantage against the Rosario reference price. This streamlined, no-registration-required process empowers buyers to make informed decisions based on real market data and logistics costs immediately.

# Admin Operations

Administrators in Agrospot play a crucial role in maintaining market dynamics. They regularly create new commercial opportunities, inputting details such as product type, quantity available, pricing, and seller location. They also manage existing opportunities, updating prices to reflect market changes, adjusting payment terms, and marking opportunities as completed when deals are closed. The admin interface provides tools for managing reference prices, monitoring match quality, and overseeing the platform's overall performance.

## Core Features

### 1. Authentication & User Management

- Google OAuth integration
- Role-based access control (user, admin)
- Invitation code system
- Session management with NextAuth

### 2. Product Management

- Agricultural product catalog
- Product categories
- Reference price tracking
- Price history

### 3. Market Operations

- Opportunity listing (seller side)
- Quotation requests (buyer side)
- Payment options handling
- Market type management (Disponible/Cosecha)

### 4. Location Services

- City and region management
- Geographic coordinate handling
- Distance calculations
- Route optimization

### 5. Pricing System

- Reference price tracking
- Currency conversion (ARS/USD)
- Transportation cost calculations
- Commission handling

### 6. Background Processing

- Asynchronous match processing
- Email notifications
- Status tracking
- Queue management

## Technical Stack

### Frontend

- Next.js 13+ (App Router)
- React
- Tailwind CSS
- shadcn/ui components
- TypeScript

### Backend

- Node.js
- Express (Worker Service)
- PostgreSQL
- Prisma ORM
- Redis (Queue System)

### Services

- SendGrid (Email)
- Mapbox (Routing)
- Google OAuth
- Railway (Deployment)
- Vercel (Frontend Hosting)

## Repository Structure

```
agrospot(1st File)/
├── prisma/
│   ├── schema.prisma           # Database schema
│   ├── seed.ts                 # Database seeding
│   └── migrations/             # Database migrations
├── src/
│   ├── app/
│   │   ├── (app)/             # Protected routes
│   │   │   ├── admin/         # Admin dashboard
│   │   │   ├── matches/       # Match management
│   │   │   ├── opportunities/ # Opportunity management
│   │   │   ├── prices/        # Price management
│   │   │   └── settings/      # User settings
│   │   ├── (public)/          # Public routes
│   │   │   └── quotations/    # Public quotation form
│   │   ├── api/               # API routes
│   │   │   ├── admin/         # Admin APIs
│   │   │   ├── auth/          # Authentication
│   │   │   ├── opportunities/ # Opportunity APIs
│   │   │   ├── quotations/    # Quotation APIs
│   │   │   └── settings/      # Settings APIs
│   │   └── auth/              # Auth pages
│   ├── components/
│   │   ├── forms/             # Form components
│   │   ├── ui/                # UI components
│   │   └── providers/         # Context providers
│   ├── lib/
│   │   ├── matching.ts        # Match logic
│   │   ├── email.ts           # Email service
│   │   ├── prisma.ts          # Database client
│   │   └── utils/             # Utility functions
│   └── types/                 # TypeScript types

agrospot-worker(2nd file)/           # Background worker service
    ├── src/
    │   ├── processors/        # Job processors
    │   ├── services/          # Worker services
    │   └── index.ts           # Worker entry point
    └── prisma/                # Worker's Prisma setup

```

## Database Schema

### Key Models

1. **User**

   - Authentication
   - Role management
   - Profile information

2. **Product**

   - Name and category
   - Reference prices
   - Market configurations

3. **Opportunity**

   - Seller listings
   - Location information
   - Pricing details
   - Status tracking

4. **Quotation**

   - Buyer requests
   - Processing status
   - Match tracking

5. **Match**

   - Opportunity-Quotation pairs
   - Score calculations
   - Route information
   - Price calculations

6. **Location**

   - Geographic data
   - City/State/Country
   - Coordinate information

7. **PaymentOption**

   - Price configurations
   - Payment terms
   - Reference price relations

8. **Route**
   - Distance calculations
   - Duration information
   - Geographic path data

## API Routes

### Authentication

- `/api/auth/[...nextauth]`
- `/api/auth/register`

### Products

- `/api/products`
- `/api/products/admin`

### Opportunities

- `/api/opportunities`
- `/api/opportunities/update-prices`

### Quotations

- `/api/quotations`
- `/api/quotations/status`

### Administrative

- `/api/admin/reference-price`
- `/api/admin/import/[type]`

### Settings

- `/api/settings`
- `/api/settings/user`

## Worker Service

### Queue Processing

- Match calculation jobs
- Email notification jobs
- Status update jobs

### Services

- Match processor
- Email service
- Transportation calculator
- Currency converter

### API Endpoints

- Process initiation
- Status checking
- Queue monitoring
- Health checks

## Environment Configuration

### Main Application

Required environment variables:

```env
DATABASE_URL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
SENDGRID_API_KEY
MAPBOX_ACCESS_TOKEN
WORKER_API_URL
BACKGROUND_PROCESSING_KEY
```

### Worker Service

Required environment variables:

```env
DATABASE_URL
REDIS_URL
SENDGRID_API_KEY
BACKGROUND_PROCESSING_KEY
```

## Deployment

### Frontend (Vercel)

- Production branch: main
- Preview deployments
- Environment variable configuration

### Worker (Railway)

- Redis service
- PostgreSQL connection
- Health check monitoring
- Auto-scaling configuration

## Core Processes

### Match Processing

1. Quotation submission
2. Background job creation
3. Match calculation
4. Price comparison
5. Route optimization
6. Email notification

### Price Management

1. Reference price updates
2. Currency conversion
3. Transportation cost calculation
4. Final price computation

### User Flow

1. Registration/Login
2. Profile completion
3. Opportunity/Quotation creation
4. Match review
5. Transaction completion

## Security Features

1. **Authentication**

   - OAuth 2.0
   - Session management
   - Role-based access

2. **API Security**

   - Rate limiting
   - Request validation
   - Error handling

3. **Data Protection**
   - Environment separation
   - Secure communication
   - Data encryption

## Monitoring & Logging

1. **Application Monitoring**

   - Error tracking
   - Performance metrics
   - User activity

2. **Worker Monitoring**

   - Queue status
   - Job processing
   - Error handling

3. **Database Monitoring**
   - Connection pool
   - Query performance
   - Migration status

## Development Guidelines

### Code Style

- ESLint configuration
- Prettier formatting
- TypeScript strict mode

### Testing

- Jest configuration
- Component testing
- API testing
- E2E testing

### Version Control

- Feature branching
- Pull request workflow
- Version tagging

### Documentation

- Code comments
- API documentation
- Deployment guides
- Configuration guides

What are we doing now ?

We are fixing the match processor. On the agrospot Worker file we are processing all the matches. We are triggering them from a cron job setup on cron-job.org!

Yesterday we made some changes to make the currencies work better. With this changes i Started to receive a lot of email from one quotation today. That was because the confirmation email and the matches were being sent correctly, but they were sent every 5 minutes on a loop because the proccesing status wasnt being updated. So the cron job thought the matches werent made and the email was being sent again. So to fix im attaching a set of files.
