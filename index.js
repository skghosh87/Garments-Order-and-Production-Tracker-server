const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

/* =====================================================
   1. MIDDLEWARES
===================================================== */
app.use(
  cors({
    origin: ["http://localhost:5173", "https://your-garments-tracker.web.app"],
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

/* =====================================================
   2. MONGODB CONNECTION
===================================================== */
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@skghosh.wrzjkjg.mongodb.net/?appName=Skghosh`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

/* =====================================================
   3. JWT MIDDLEWARES
===================================================== */
const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

const verifyAdmin = async (req, res, next) => {
  const user = await usersCollection.findOne({ email: req.user.email });
  if (user?.role?.toLowerCase() !== "admin") {
    return res.status(403).send({ message: "Admins only" });
  }
  next();
};

/* =====================================================
   4. MAIN FUNCTION
===================================================== */
let usersCollection;
let productsCollection;
let ordersCollection;
let messagesCollection;

async function run() {
  try {
    await client.connect();
    console.log("✅ MongoDB connected");

    const db = client.db("garmentsTrackerDB");
    usersCollection = db.collection("users");
    productsCollection = db.collection("products");
    ordersCollection = db.collection("orders");
    messagesCollection = db.collection("messages");

    /* ================= AUTH ================= */
    app.post("/api/v1/auth/jwt", async (req, res) => {
      const { email } = req.body;
      const user = await usersCollection.findOne({ email });
      const role = user?.role || "Buyer";

      const token = jwt.sign({ email, role }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        })
        .send({ success: true, role });
    });

    app.post("/api/v1/auth/logout", (req, res) => {
      res
        .clearCookie("token", {
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        })
        .send({ success: true });
    });

    /* ================= USERS ================= */
    app.post("/api/v1/users", async (req, res) => {
      const user = req.body;
      const exists = await usersCollection.findOne({ email: user.email });
      if (exists) {
        return res.send({ message: "User already exists" });
      }
      const result = await usersCollection.insertOne({
        ...user,
        role: "Buyer",
        status: "verified",
        createdAt: new Date(),
      });
      res.send(result);
    });

    app.get("/api/v1/users/role/:email", async (req, res) => {
      const user = await usersCollection.findOne({ email: req.params.email });
      res.send({
        role: user?.role || "Buyer",
        status: user?.status || "verified",
      });
    });

    app.get("/api/v1/users", verifyToken, verifyAdmin, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.patch(
      "/api/v1/users/role/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { role: req.body.role } }
        );
        res.send(result);
      }
    );

    /* ================= PRODUCTS ================= */
    app.post("/api/v1/products", verifyToken, async (req, res) => {
      const role = req.user.role.toLowerCase();
      if (role !== "admin" && role !== "manager") {
        return res.status(403).send({ message: "Forbidden" });
      }

      const product = {
        ...req.body,
        price: Number(req.body.price),
        quantity: Number(req.body.quantity),
        minOrderQty: Number(req.body.minOrderQty),
        addedBy: req.user.email,
        createdAt: new Date(),
      };

      const result = await productsCollection.insertOne(product);
      res.send(result);
    });

    app.get("/api/v1/products", async (req, res) => {
      const { limit } = req.query;
      const cursor = productsCollection.find();
      if (limit) cursor.limit(Number(limit));
      const result = await cursor.toArray();
      res.send(result);
    });

    /* ================= ORDERS ================= */
    app.post("/api/v1/orders", verifyToken, async (req, res) => {
      const order = {
        ...req.body,
        buyerEmail: req.user.email,
        status: "pending",
        createdAt: new Date(),
        trackingHistory: [{ status: "Order Placed", time: new Date() }],
      };
      const result = await ordersCollection.insertOne(order);
      res.send(result);
    });

    app.get("/api/v1/orders/my-orders", verifyToken, async (req, res) => {
      const email = req.user.email;
      const query = { userEmail: email };
      const result = await ordersCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/api/v1/orders", verifyToken, verifyAdmin, async (req, res) => {
      const result = await ordersCollection.find().toArray();
      res.send(result);
    });

    /* ================= CONTACT ================= */
    app.post("/api/v1/contact", async (req, res) => {
      const result = await messagesCollection.insertOne({
        ...req.body,
        createdAt: new Date(),
      });
      res.send(result);
    });

    app.get("/", (req, res) => res.send("🚀 Garments Tracker API Running"));
  } catch (error) {
    console.error(error);
  }
}

run();

/* =====================================================
   5. SERVER LISTEN
===================================================== */
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
