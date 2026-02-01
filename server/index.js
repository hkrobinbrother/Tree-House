require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const nodemailer = require("nodemailer");
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);

const morgan = require('morgan')
// const { cacheSignal } = require('react')

const port = process.env.PORT || 9000
const app = express()
// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token

  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}

// send email using nodemailer
const sendEmail = (emailAddress, emailData) => {
  // create transporter
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // Use true for port 465, false for port 587
    auth: {
      user: process.env.NODEMAILER_USER,
      pass: process.env.NODEMAILER_PASS,
    },
  });
  // verify connection
  transporter.verify((error, success) => {
    if (error) {
      console.log("Email transporter error", error)
    } else {
      console.log("Transporter is ready to email", success)
    }
  })
  // transporter send mail
  const mailBody =
  {
    from: process.env.NODEMAILER_USER,
    to: emailAddress,
    subject: emailData?.subject,
    message: emailData?.message,
    html: `<p>${emailData?.message}</p>`, // HTML version of the message
  }
  // send mail
  transporter.sendMail(mailBody, (error, info) => {
    if (error) {
      console.log("Email sending error", error)
    } else {

      console.log("Email sent successfully", info?.response)
    }
  })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.d1icoll.mongodb.net/?appName=Cluster0`;
console.log(process.env.DB_USER)

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})
async function run() {
  try {
    const db = client.db("treeHouse-session")
    const usersCollection = db.collection("users")
    const plantsCollection = db.collection("plants")
    const ordersCollection = db.collection("orders")

    // verify admin middleware

    const verifyAdmin = async (req, res, next) => {
      // console.log("data from verify token middle ware", req.user?.email)
      const email = req.user?.email
      const query = { email }
      const result = await usersCollection.findOne(query)
      if (!result || result?.role !== "admin") return res.status(403).send({ message: "Forbidden access! Admin only actions!" })
      next()
    }

    // verify seller middleware
    const verifySeller = async (req, res, next) => {
      const email = req.user?.email
      const query = { email }
      const result = await usersCollection.findOne(query)
      if (!result || result?.role !== "seller") return res.status(403).send({ message: "Forbidden access! Seller only actions!" })
      next()
    }

    // save or update user in db

    app.post("/users/:email", async (req, res) => {
      sendEmail()
      const email = req.params.email
      const query = { email }
      const user = req.body
      // check if user exists in db
      const isExist = await usersCollection.findOne(query)
      if (isExist) {
        return res.send(isExist)
      }
      const result = await usersCollection.insertOne({ ...user, role: "customer", timestamp: Date.now() })
      res.send(result)
    })

    // manage user status and role
    app.patch("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email
      const query = { email }
      const user = await usersCollection.findOne(query)
      if (!user || user?.status === "Requested") return res.status(400).send("You have already requested, wait for some time!")

      const updateDoc = {
        $set: {
          status: "Requested",
        },
      }

      const result = await usersCollection.updateOne(query, updateDoc)
      console.log(result)
      res.send(result)

    })

    // get all user data

    app.get("/all-users/:email", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email
      // the admin was not to see her email in manage users 
      const query = { email: { $ne: email } }
      const result = await usersCollection.find(query).toArray()
      res.send(result)
    })
    // update a user role & status

    app.patch("/user/role/:email", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email
      const { role } = req.body
      const filter = { email }
      const updateDoc = {
        $set: { role, status: "Verified" },

      }
      const result = await usersCollection.updateOne(filter, updateDoc)
      res.send(result)

    })

    // get inventory data for sellers

    app.get("/plants/seller", verifyToken, verifySeller, async (req, res) => {
      const email = req.user.email

      const result = await plantsCollection.find({ "seller.email": email }).toArray()
      res.send(result)
    })

    // deleted a plant from db by seller
    app.delete("/plants/:id", verifyToken, verifySeller, async (req, res) => {
      console.log("deleted hit")
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await plantsCollection.deleteOne(query)
      res.send(result)
    })

    // get user role
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email
      const result = await usersCollection.findOne({ email })
      res.send({ role: result?.role })
    })

    // Generate jwt token
    app.post('/jwt', async (req, res) => {
      const email = req.body
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })
    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
      } catch (err) {
        res.status(500).send(err)
      }
    })


    // save a plants in db
    app.post("/plants", verifyToken, verifySeller, async (req, res) => {
      const plant = req.body
      const result = await plantsCollection.insertOne(plant)
      res.send(result)
    })

    // get all plants from db
    app.get("/plants", async (req, res) => {

      const result = await plantsCollection.find().limit(20).toArray()
      res.send(result)
    })


    // get a plant by Id
    app.get("/plants/:id", async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await plantsCollection.findOne(query)
      res.send(result)
    })

    // save order data in db
    app.post("/orders", verifyToken, async (req, res) => {
      const orderInfo = req.body
      console.log(orderInfo)
      const result = await ordersCollection.insertOne(orderInfo)
      // send email
      if (result?.insertedId) {
        // to customer email
        sendEmail(orderInfo?.customer?.email, {
          subject: "Order Placed Successfully!",
          message: `You've placed an order successfully . Your order ID is ${result?.insertedId}`
        })
        // to seller email
        sendEmail(orderInfo?.seller, {
          subject: "New Order Received!",
          message: `You have a new order. Order ID is ${result?.insertedId}. and ${orderInfo?.customer?.name}  Please check your seller dashboard to process the order.`
        })
      }
      res.send(result)
    })

    // manage plant quantity

    app.patch("/plants/quantity/:id", verifyToken, async (req, res) => {
      const id = req.params.id
      const { quantityToUpdate, status } = req.body
      const filter = { _id: new ObjectId(id) }
      let updateDoc = {
        $inc: { quantity: -quantityToUpdate },
      }
      if (status === "increase") {
        updateDoc = {
          $inc: { quantity: quantityToUpdate },
        }
      }
      const result = await plantsCollection.updateOne(filter, updateDoc)
      res.send(result)
    })

    // get all orders for a spacific cousomer order
    app.get("/customer-orders/:email", verifyToken, async (req, res) => {

      const email = req.params.email
      const quary = { "customer.email": email }
      const result = await ordersCollection.aggregate([
        {
          // match spechific coustomer data only bt email
          $match: quary,

        },
        {
          $addFields: {
            // convert plantId string field to object field 
            plantId: { $toObjectId: "$plantId" },
          },

        },
        {
          $lookup: {
            // got to a different collection and look for data
            // collection name
            from: "plants",
            // local data that you want to match
            localField: "plantId",
            // foreign field name of the same data
            foreignField: "_id",
            // return that data plants array (array naming)
            as: "plants",
          }
        },
        {
          // add these fields in order object
          $unwind: "$plants"
        },
        {
          $addFields: {
            name: "$plants.name",
            image: "$plants.image",
            category: "$plants.category"
          }

        },
        {
          // remove plants object property from by order object 
          $project: { plants: 0 }
        }
      ]).toArray()

      res.send(result)
    })



    // get all orders for a spacific seller
    app.get("/seller-orders/:email", verifyToken, verifySeller, async (req, res) => {

      const email = req.params.email
      const quary = { seller: email }
      const result = await ordersCollection.aggregate([
        {
          // match spechific coustomer data only bt email
          $match: quary,

        },
        {
          $addFields: {
            // convert plantId string field to object field 
            plantId: { $toObjectId: "$plantId" },
          },

        },
        {
          $lookup: {
            // got to a different collection and look for data
            // collection name
            from: "plants",
            // local data that you want to match
            localField: "plantId",
            // foreign field name of the same data
            foreignField: "_id",
            // return that data plants array (array naming)
            as: "plants",
          }
        },
        {
          // add these fields in order object
          $unwind: "$plants"
        },
        {
          $addFields: {
            name: "$plants.name",

          }

        },
        {
          // remove plants object property from by order object 
          $project: { plants: 0 }
        }
      ]).toArray()

      res.send(result)
    })

    // update order status
    app.patch("/orders/:id", verifyToken, verifySeller, async (req, res) => {
      const id = req.params.id
      const { status } = req.body
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: { status },

      }
      const result = await ordersCollection.updateOne(filter, updateDoc)
      res.send(result)

    })
    // cancle/deleted order
    app.delete("/orders/:id", verifyToken, async (req, res) => {
      const id = req.params.id
      const quary = { _id: new ObjectId(id) }
      const order = await ordersCollection.findOne(quary)
      if (order.status === "Delivered") return res.status(409).send("Cannot cancle onece the product in delivered!")
      const result = await ordersCollection.deleteOne(quary)
      res.send(result)
    })

    // admin statistics
    app.get("/admin-stat", verifyToken, verifyAdmin, async (req, res) => {
      // get total users,total plants
      const totalUsers = await usersCollection.countDocuments()
      const totalPlants = await plantsCollection.estimatedDocumentCount()

      const allOrder = await ordersCollection.find().toArray()
      // const totalOrders = allOrder.length
      // const totalPrice = allOrder.reduce((sum,order)=> sum + order.price ,0)   

      // generate chart data
      const chartData = await ordersCollection.aggregate([
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: { $toDate: "$_id" } } },
            quantity: { $sum: "$quantity" },
            price: { $sum: "$price" },
            order: { $sum: 1 }
          },
        },
        {
          $project: {
            _id: 0,
            date: "$_id",
            quantity: 1,
            order: 1,
            price: 1
          }
        }
      ]).next()



      // get total revenue and total orders
      const ordersDetails = await ordersCollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$price" },
            totalOrders: { $sum: 1 }
          },
        },
        { $project: { _id: 0 } }
      ]).next()

      res.send({ totalUsers, totalPlants, ...ordersDetails, chartData })

    })

    // create payment intent
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { quantity, plantId } = req.body
      const plant = await plantsCollection.findOne({ _id: new ObjectId(plantId) })
      if (!plant) {
        return res.status(404).send({ message: "Plant not found!" })
      }

      const price = Number(plant.price);
      const qty = Number(quantity);

      if (isNaN(price) || isNaN(qty)) {
        return res.status(400).send({
          message: "Invalid price or quantity",
        });
      }

      const totalPrice = Math.round(price * qty * 100);
      // in cents
      const { client_secret } = await stripe.paymentIntents.create({
        amount: totalPrice,
        currency: 'usd',
        automatic_payment_methods: {
          enabled: true,
        },
      });
      res.send({
        clientSecret: client_secret
      })
    })

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from tree-house Server..')
})

app.listen(port, () => {
  console.log(`tree-house is running on port ${port}`)
})
