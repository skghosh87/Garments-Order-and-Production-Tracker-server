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

    // ২. JWT এবং রোল চেক করার এপিআই (৪0৪ এরর এবং ভুল রোল সমস্যার সমাধান)
    app.post("/api/v1/auth/jwt", async (req, res) => {
      const user = req.body;
      // ডাটাবেস থেকে ইউজারের আসল রোল খুঁজে বের করা
      const userData = await usersCollection.findOne({ email: user.email });

      // টোকেন জেনারেশন লজিক (jwt ইমপোর্ট করা থাকতে হবে উপরে)
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });

      // রোলসহ রেসপন্স পাঠানো
      res.send({
        success: true,
        role: userData?.role || "Buyer", // ডাটাবেসে যা আছে তাই দেখাবে
      });
    });

    await client.db("admin").command({ ping: 1 });
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Garments Tracker Server started on port ${port}`);
});
