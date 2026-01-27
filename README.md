# Sustainable Classroom – E-Learning Platform

An interactive e-learning web application designed to support students with features like video/text-based learning, coding workbench, progress tracking, and more — all managed via a scalable microservice architecture.

---

##  Features

-  Secure user authentication (Login & Register)
-  Video &  Text-based learning modules
-  Integrated coding workbench (Frontend simulation)
-  Student progress tracking
-  Knowledge testing through assessments
-  User profile management
-  React + Tailwind UI
-  Node.js + Express backend
-  MongoDB database
-  Microservices ready (future scaling)
-  Hosted with Vite dev server

---

## 🛠️ Tech Stack

| Layer       | Tools                                      |
|-------------|--------------------------------------------|
| Frontend    | React, Vite, Tailwind CSS                  |
| Backend     | Node.js, Express.js                        |
| Database    | MongoDB, Mongoose                          |
| Auth        | JSON Web Token (JWT), bcrypt (optional)    |
| Versioning  | Git + GitHub                               |
| Styling     | TailwindCSS                                |

---

##  Folder Structure

elearning-auth-project/
├── client/                  # React frontend (Vite)
│   ├── public/
│   ├── src/
│   │   ├── assets/          # Static assets like images
│   │   ├── components/      # Reusable UI components
│   │   └── pages/           # Page components (Login, Dashboard, Courses, etc.)
│   ├── tailwind.config.js   # Tailwind CSS config
│   └── vite.config.js       # Vite config
│
├── server/                  # Node.js + Express backend
│   ├── models/              # MongoDB schemas
│   ├── routes/              # API routes (auth, user)
│   ├── controllers/         # Business logic (auth handlers, etc.)
│   └── server.js            # Main Express entry point
│
└── README.md                # Project documentation



---

##  Getting Started

###  Prerequisites

- Node.js v18+
- MongoDB local or Atlas instance

###  Setup

# ⚙️ Getting Started

# 🔧 Prerequisites:
# - Node.js v18+ must be installed
# - MongoDB running locally or an Atlas URI ready



# 1. Set up the Client
npm create vite@latest client -- --template react
cd client
npm install
# Optional: install Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Configure Tailwind in tailwind.config.js and index.css accordingly
# Now start client
npm run dev

# 2. Set up the Server
cd ..
mkdir server
cd server
npm init -y
npm install express mongoose dotenv cors

# Create server.js and add your Express server logic
# Example:
echo "require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI).then(() => {
  console.log('MongoDB connected');
});

app.listen(5000, () => console.log('Server running on port 5000'));" > server.js

# Create .env file
echo "MONGO_URI=mongodb://localhost:27017/sustainable_classroom" > .env

# Start the backend server
node server.js


API Endpoints

Auth
bash
Copy
Edit
POST /api/auth/register
POST /api/auth/login
More coming soon…
