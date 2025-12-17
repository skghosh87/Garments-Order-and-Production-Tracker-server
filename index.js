const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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

    // 4. Get User Role & Status API (সংশোধিত)
    app.get("/api/v1/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });

      // রোল এবং স্ট্যাটাস দুটোই পাঠানো জরুরি (RoleBasedRoute এর জন্য)
      res.send({
        role: user?.role || "Buyer",
        status: user?.status || "verified",
      });
    });

    // 5. প্রোডাক্ট অ্যাড করার এপিআই (Error Handling সহ)
    app.post("/api/v1/products", async (req, res) => {
      try {
        const product = req.body;
        const result = await productsCollection.insertOne(product);
        // ফ্রন্টএন্ড insertedId চেক করে, তাই পুরো রেজাল্ট পাঠানোই ভালো
        res.send(result);
      } catch (error) {
        console.error("Insert Error:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // 6. প্রোডাক্ট লিস্ট API (এটি না থাকলে OurProducts এ ৪0৪ দেখাবে)
    app.get("/api/v1/products", async (req, res) => {
      const result = await productsCollection.find().limit(6).toArray();
      res.send(result);
    });
    // ==========================================
    // Product Management APIs (Update & Delete)
    // ==========================================

    // 7. নির্দিষ্ট প্রোডাক্ট ডিলিট করার এপিআই
    app.delete("/api/v1/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      try {
        const result = await productsCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error deleting product", error });
      }
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
