const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// *******************
// 1. Middlewares
// *******************
app.use(
  cors({
    origin: ["http://localhost:5173", "https://your-garments-tracker.web.app"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// *******************
// 2. MongoDB Connection
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
    const database = client.db("garmentsTrackerDB");
    const usersCollection = database.collection("users");
    const productsCollection = database.collection("products");
    const ordersCollection = database.collection("orders");

    // ==========================================
    // 3. JWT & Auth Middleware
    // ==========================================

    // টোকেন জেনারেট এবং কুকি সেট (লগইন করার পর এটি কল করবেন)
    app.post("/api/v1/auth/jwt", async (req, res) => {
      const user = req.body; // ইমেইল আসবে
      const userData = await usersCollection.findOne({ email: user.email });

      const payload = {
        email: user.email,
        role: userData?.role || "Buyer",
      };

      const token = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        })
        .send({ success: true, role: payload.role });
    });

    // লগআউট (কুকি ক্লিয়ার করা)
    app.post("/api/v1/auth/logout", (req, res) => {
      res
        .clearCookie("token", { maxAge: 0, sameSite: "none", secure: true })
        .send({ success: true });
    });

    // টোকেন ভেরিফাই করার মিডলওয়্যার
    const verifyToken = (req, res, next) => {
      const token = req?.cookies?.token;
      if (!token)
        return res.status(401).send({ message: "Unauthorized access" });

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err)
          return res.status(401).send({ message: "Unauthorized access" });
        req.user = decoded;
        next();
      });
    };

    // ==========================================
    // 4. User APIs
    // ==========================================

    // ইউজারের রোল এবং স্ট্যাটাস চেক (AuthProvider-এর জন্য)
    app.get("/api/v1/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      if (!user) return res.send({ role: "Buyer", status: "verified" });
      res.send({ role: user.role, status: user.status });
    });

    // ইউজার সেভ করা (Registration-এর জন্য)
    app.post("/api/v1/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser)
        return res.send({ message: "User exists", insertedId: null });
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // ==========================================
    // 5. Product & Order APIs
    // ==========================================

    // একক প্রোডাক্ট ডিটেইলস (ProductDetailsPage-এর জন্য)
    app.get("/api/v1/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.findOne(query);
      res.send(result);
    });

    // অর্ডার প্লেস করা এবং স্টক আপডেট করা
    app.post("/api/v1/orders", verifyToken, async (req, res) => {
      const order = req.body;

      // অর্ডার সেভ করা
      const orderDoc = {
        ...order,
        status: "pending",
        orderDate: new Date(),
        trackingHistory: [
          { status: "Order Placed", time: new Date(), location: "System" },
        ],
      };
      const result = await ordersCollection.insertOne(orderDoc);

      // স্টক কমানো
      const filter = { _id: new ObjectId(order.productId) };
      const updateDoc = { $inc: { quantity: -order.orderQuantity } };
      await productsCollection.updateOne(filter, updateDoc);

      res.send(result);
    });

    console.log("MongoDB connected and API endpoints ready!");
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("Garments Tracker API is running"));
app.listen(port, () => console.log(`Server is running on port: ${port}`));
