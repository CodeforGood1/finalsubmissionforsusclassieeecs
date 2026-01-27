# TECH STACK

## Frontend
- **React** 18.3.1 - UI framework
- **React Router DOM** 6.20.0 - Client-side routing
- **Vite** 5.4.10 - Build tool and development server
- **Tailwind CSS** 3.3.6 - Utility-first CSS framework
- **PostCSS** 8.4.32 - CSS processing
- **Autoprefixer** 10.4.16 - CSS vendor prefixing
- **ESLint** 9.13.0 - Code linting

## Backend
- **Node.js** 18+ - JavaScript runtime
- **Express** 4.18.2 - Web application framework
- **PostgreSQL** - Primary database (Neon cloud/local)
- **bcrypt** 5.1.1 - Password hashing
- **jsonwebtoken** 9.0.2 - JWT authentication
- **cors** 2.8.5 - Cross-origin resource sharing
- **dotenv** 16.3.1 - Environment variable management
- **pg** 8.11.3 - PostgreSQL client

## File Storage & Media
- **Cloudinary** 1.41.0 - Cloud-based image and video management
- **multer** 1.4.5 - File upload handling
- **multer-storage-cloudinary** 4.0.0 - Cloudinary storage integration

## Email Services
- **Mailjet** (via node-mailjet 6.0.11) - Email delivery service
- **Resend** 6.7.0 - Alternative email service
- **Nodemailer** 7.0.12 - Email client library

## Development & Testing
- **Jest** 30.2.0 - Testing framework
- **Supertest** 7.2.2 - HTTP assertion testing
- **Nodemon** 3.0.1 - Development auto-restart
- **better-sqlite3** 12.6.0 - SQLite for testing

## Containerization & Deployment
- **Docker** - Application containerization
- **Docker Compose** - Multi-container orchestration
- **PostgreSQL** 15-alpine - Database container
- **Node.js** 18-alpine - Application container
- **Render** - Cloud deployment platform

## Database
- **PostgreSQL** 15 - Relational database
- **Connection Pooling** - Built-in pg pooling
- **SSL Support** - Secure database connections
- **Advanced Features**:
  - Views and triggers
  - JSON data types
  - Full-text search capabilities
  - Custom functions

## Security
- **bcrypt** - Password hashing
- **JWT** - Token-based authentication
- **CORS** - Cross-origin protection
- **SSL/TLS** - Encrypted connections
- **Environment Variables** - Secure configuration
- **Role-based Access Control** - Admin/Teacher/Student roles

## Infrastructure
- **Cloud Database** - Neon PostgreSQL
- **CDN** - Cloudinary media delivery
- **Container Registry** - Docker Hub/Render
- **CI/CD** - Git-based deployment
- **Domain & SSL** - Automatic HTTPS

## Key Features Supported
- **Real-time Notifications** - In-app and email
- **File Uploads** - Videos, images, documents
- **Progress Tracking** - Module completion, time tracking
- **Assessment System** - MCQ tests, coding problems
- **Admin Dashboard** - User management, analytics
- **Responsive Design** - Mobile-first approach
- **API-first Architecture** - RESTful endpoints

## Architecture Pattern
- **Multi-tier Architecture**
  - Presentation Layer: React frontend
  - Business Logic Layer: Express.js API
  - Data Access Layer: PostgreSQL with pg client
  - External Services: Cloudinary, Mailjet
- **Stateless Backend** - JWT-based authentication
- **Microservice-ready** - Modular service structure