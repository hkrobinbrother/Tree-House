require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const path = require('path')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const nodemailer = require("nodemailer")
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const morgan = require('morgan')

const port = process.env.PORT || 9000
const app = express()

// ================= Middleware =================
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))

// ================= JWT Middleware =================
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token
  if (!token) return res.status(401).send({ message: 'unauthorized access' })

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}

// ================= Email Helper =================
const sendEmail = (emailAddress, emailData) => {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.NODEMAILER_USER,
      pass: process.env.NODEMAILER_PASS,
    },
  })

  transporter.sendMail({
    from: process.env.NODEMAILER_USER,
    to: emailAddress,
    subject: emailData?.subject,
    html: `<p>${emailData?.message}</p>`,
  }, (error, info) => {
    if (error) console.log("Email error", error)
    else console.log("Email sent", info?.response)
  })
}

// ================= MongoDB Setup =================
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.d1icoll.mongodb.net/?appName=Cluster0`
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
})

async function run() {
  try {
    const db = client.db("treeHouse-session")
    const usersCollection = db.collection("users")
    const plantsCollection = db.collection("plants")
    const ordersCollection = db.collection("orders")

    // ================= Role Middleware =================
    const verifyAdmin = async (req, res, next) => {
      const email = req.user?.email
      const user = await usersCollection.findOne({ email })
      if (!user || user.role !== "admin") return res.status(403).send({ message: "Forbidden! Admin only" })
      next()
    }

    const verifySeller = async (req, res, next) => {
      const email = req.user?.email
      const user = await usersCollection.findOne({ email })
      if (!user || user.role !== "seller") return res.status(403).send({ message: "Forbidden! Seller only" })
      next()
    }

    // ================= API Routes =================

    // Save or update user
    app.post("/users/:email", async (req, res) => {
      const email = req.params.email
      const user = req.body
      const existing = await usersCollection.findOne({ email })
      if (existing) return res.send(existing)

      const result = await usersCollection.insertOne({ ...user, role: "customer", timestamp: Date.now() })
      sendEmail(email, { subject: "Welcome!", message: "You are registered successfully!" })
      res.send(result)
    })

    // Get all users (admin only)
    app.get("/all-users/:email", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email
      const users = await usersCollection.find({ email: { $ne: email } }).toArray()
      res.send(users)
    })

    // Update user role (admin only)
    app.patch("/user/role/:email", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email
      const { role } = req.body
      const result = await usersCollection.updateOne({ email }, { $set: { role, status: "Verified" } })
      res.send(result)
    })

    // Get seller plants
    app.get("/plants/seller", verifyToken, verifySeller, async (req, res) => {
      const email = req.user.email
      const plants = await plantsCollection.find({ "seller.email": email }).toArray()
      res.send(plants)
    })

    // Add new plant (seller only)
    app.post("/plants", verifyToken, verifySeller, async (req, res) => {
      const plant = req.body
      const result = await plantsCollection.insertOne(plant)
      res.send(result)
    })

    // Get all plants
    app.get("/plants", async (req, res) => {
      const plants = await plantsCollection.find().limit(20).toArray()
      res.send(plants)
    })

    // Get single plant
    app.get("/plants/:id", async (req, res) => {
      const plant = await plantsCollection.findOne({ _id: new ObjectId(req.params.id) })
      res.send(plant)
    })

    // Orders
    app.post("/orders", verifyToken, async (req, res) => {
      const order = req.body
      const result = await ordersCollection.insertOne(order)

      // send emails
      if (result?.insertedId) {
        sendEmail(order.customer.email, { subject: "Order Placed", message: `Your order ID: ${result.insertedId}` })
        sendEmail(order.seller, { subject: "New Order", message: `Order ID: ${result.insertedId} from ${order.customer.name}` })
      }

      res.send(result)
    })

    // Payment intent (Stripe)
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { quantity, plantId } = req.body
      const plant = await plantsCollection.findOne({ _id: new ObjectId(plantId) })
      if (!plant) return res.status(404).send({ message: "Plant not found" })

      const totalPrice = Math.round(Number(plant.price) * Number(quantity) * 100)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalPrice,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
      })

      res.send({ clientSecret: paymentIntent.client_secret })
    })

    await client.db('admin').command({ ping: 1 })
    console.log('Connected to MongoDB successfully!')

  } finally {
    // Do not close client in a long-running server
  }
}
run().catch(console.dir)

// ================= Serve React Frontend =================
const frontendPath = path.join(__dirname, '../client/dist')
app.use(express.static(frontendPath))
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'))
})

// ================= Start Server =================
app.listen(port, () => {
  console.log(`tree-house is running on port ${port}`)
})