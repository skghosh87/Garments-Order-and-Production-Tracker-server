const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// *******************
// 1. CORS Configuration
// *******************
app.use(
  cors({
    origin: ["http://localhost:5173", "https://your-production-link.com"], // আপনার লাইভ লিঙ্ক এখানে দিন
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

// ==========================================
// Middlewares (Verify Token, Admin, Status)
// ==========================================
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

async function run() {
  try {
    // await client.connect(); // Production এ এটি না দিলেও চলে, তবে কানেকশন নিশ্চিত করে
    console.log("MongoDB successfully connected!");

    const database = client.db("garmentsTrackerDB");
    const usersCollection = database.collection("users");
    const productsCollection = database.collection("products");
    const ordersCollection = database.collection("orders");
    // verifyAdmin: অ্যাডমিন কিনা চেক করার জন্য
    const verifyAdmin = async (req, res, next) => {
      const email = req.user.email;
      const user = await usersCollection.findOne({ email: email });
      if (user?.role !== "admin") {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      next();
    };

    // verifyStatus: ইউজার সাসপেন্ডেড কি না চেক করার জন্য
    const verifyStatus = async (req, res, next) => {
      const email = req.user.email;
      const user = await usersCollection.findOne({ email: email });
      if (user?.status === "suspended") {
        return res.status(403).send({
          message: "Account Suspended",
          feedback: user.feedback,
        });
      }
      next();
    };

    // ==========================================
    // 1. Authentication & JWT APIs
    // ==========================================

    app.post("/api/v1/auth/jwt", async (req, res) => {
      const user = req.body;
      const userData = await usersCollection.findOne({ email: user.email });

      // টোকেনের ভেতরে ইমেইল এবং রোল সেভ করা হচ্ছে (সিকিউরিটির জন্য)
      const tokenPayload = {
        email: user.email,
        role: userData?.role || "Buyer",
      };

      const token = jwt.sign(tokenPayload, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        })
        .send({
          success: true,
          role: userData?.role || "Buyer",
        });
    });

    app.post("/api/v1/auth/logout", async (req, res) => {
      res.clearCookie("token", { maxAge: 0 }).send({ success: true });
    });

    // ==========================================
    // 2. User & Profile APIs
    // ==========================================

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

    app.get("/api/v1/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      res.send({
        role: user?.role || "Buyer",
        status: user?.status || "verified",
      });
    });

    // প্রোফাইল আপডেট এপিআই (আপনার নতুন রিকোয়েস্ট অনুযায়ী)
    app.patch("/api/v1/users/update-profile", verifyToken, async (req, res) => {
      const { email, displayName, photoURL } = req.body;
      const requesterEmail = req.user.email;
      const requesterRole = req.user.role;

      // সিকিউরিটি: অ্যাডমিন সবার টা পারে, অন্যরা শুধু নিজের টা
      if (requesterRole !== "admin" && requesterEmail !== email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      const filter = { email: email };
      const updatedDoc = {
        $set: { displayName, photoURL },
      };
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // ==========================================
    // 3. Product Management APIs
    // ==========================================

    app.get("/api/v1/products", async (req, res) => {
      const result = await productsCollection.find().toArray();
      res.send(result);
    });

    app.post("/api/v1/products", verifyToken, async (req, res) => {
      const product = req.body;
      const result = await productsCollection.insertOne(product);
      res.send(result);
    });

    app.put("/api/v1/products/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedProduct = req.body;
      const requesterEmail = req.user.email;
      const requesterRole = req.user.role;

      const product = await productsCollection.findOne(filter);

      // সিকিউরিটি চেক
      if (requesterRole === "admin" || product?.addedBy === requesterEmail) {
        const updateDoc = {
          $set: {
            name: updatedProduct.name,
            category: updatedProduct.category,
            price: updatedProduct.price,
            minOrderQty: updatedProduct.minOrderQty,
            description: updatedProduct.description,
            image: updatedProduct.image,
            status: updatedProduct.status || "active",
          },
        };
        const result = await productsCollection.updateOne(filter, updateDoc);
        res.send(result);
      } else {
        res.status(403).send({ message: "Forbidden: Not your product" });
      }
    });

    app.delete("/api/v1/products/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const requesterEmail = req.user.email;
      const requesterRole = req.user.role;

      const filter = { _id: new ObjectId(id) };
      const product = await productsCollection.findOne(filter);

      if (requesterRole === "admin" || product?.addedBy === requesterEmail) {
        const result = await productsCollection.deleteOne(filter);
        res.send(result);
      } else {
        res.status(403).send({ message: "Forbidden Access" });
      }
    });

    // পিন কমান্ড টেস্ট
    await client.db("admin").command({ ping: 1 });
  } finally {
    // client.close() এখানে দেওয়ার প্রয়োজন নেই
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Garments Tracker Server is running...");
});

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
