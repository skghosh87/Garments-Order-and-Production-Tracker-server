const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

// কালেকশন রেফারেন্স পাস করার জন্য একটি ফাংশন এক্সপোর্ট করা হলো
const authRouter = (usersCollection) => {
  // JWT তৈরি ও কুকিতে সেট করার API
  router.post("/jwt", async (req, res) => {
    const user = req.body;

    // ১. JWT তৈরি
    const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "1h",
    });

    // ২. কুকিতে টোকেন সেট
    // সিকিউরিটি: httpOnly, secure (production এর জন্য), sameSite (production এর জন্য)
    res
      .cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // লাইভ সার্ভারে হলে true
        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        maxAge: 60 * 60 * 1000, // 1 ঘণ্টা
      })
      .send({ success: true }); // ক্লায়েন্টকে সফল বার্তা পাঠানো
  });

  // লগআউট API (কুকি থেকে টোকেন সরানো)
  router.post("/logout", async (req, res) => {
    try {
      res
        .clearCookie("token", {
          maxAge: 0,
          secure: process.env.NODE_ENV === "production",
          httpOnly: true,
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true, message: "Logged out successfully." });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).send({ success: false, message: "Logout failed." });
    }
  });

  return router;
};

module.exports = authRouter;
