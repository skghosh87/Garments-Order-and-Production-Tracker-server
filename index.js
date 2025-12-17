const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// *******************
// 1. CORS Configuration (Critical for JWT via Cookies)
// *******************
// Client side domains allowed to access the server
const allowedOrigins = [
  "http://localhost:5173",
  // Live deployment URLs can be added here
  // 'https://your-garments-tracker-client.netlify.app',
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  })
);

// *******************
// 2. Middleware Setup
// *******************
app.use(express.json());
app.use(cookieParser());

// *******************
// 3. MongoDB Connection
// *******************
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@skghosh.wrzjkjg.mongodb.net/?appName=Skghosh`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("MongoDB successfully connected!");

    // Database and Collections
    const database = client.db("garmentsTrackerDB");
    const usersCollection = database.collection("users");
    const productsCollection = database.collection("products");
    const ordersCollection = database.collection("orders");
    //1. User save apis
    app.post("/api/v1/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // 2. Check the jwt and role api (Fixing 404 error and wrong role issue)
    app.post("/api/v1/auth/jwt", async (req, res) => {
      const user = req.body;
      // Get the actual role from the database
      const userData = await usersCollection.findOne({ email: user.email });

      // Token Generation logic
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });

      // Response with token and user role
      res.send({
        success: true,
        role: userData?.role || "Buyer",
      });
    });

    // 3. Logout API (Cookie Clearing)
    app.post("/api/v1/auth/logout", async (req, res) => {
      res.send({ success: true });
    });
    //................................................
    await client.db("admin").command({ ping: 1 });
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Garments Tracker Server started on port ${port}`);
});
