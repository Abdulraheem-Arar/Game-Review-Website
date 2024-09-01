import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from 'bcrypt';
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import axios from 'axios';
import env from "dotenv";

const app = express();
const port = 3000;
env.config();
const saltRounds = 10;

var today = new Date();
var dd = String(today.getDate()).padStart(2, '0');
var mm = String(today.getMonth() + 1).padStart(2, '0'); 
var yyyy = today.getFullYear();

today = dd + '/' + mm + '/' + yyyy;
const API_URL = "https://www.cheapshark.com/api/1.0/games";


var lookup = {};
var user={};
var posts = [];

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());




app.get("/", async (req, res) => {
  res.render("home.ejs");
});

app.get("/new", async (req, res) => {
  res.render("modify.ejs",{heading:'new entry',submit:'submit'});
});

app.get("/edit/:id", async (req, res) => {
  var id= parseInt(req.params.id);
  for (var i=0;i<posts.length;i++){
    if(posts[i].id===id){
      var index = i;
    }
  }
  res.render('modify.ejs',{heading:'edit post',submit:'submit edit', post:posts[index]});
});

app.get("/delete/:id", async (req, res) => {
  var id= parseInt(req.params.id);
  for (var i=0;i<posts.length;i++){
    if(posts[i].id===id){
      var index = i;
    }
  }
  res.render('delete.ejs',{post:posts[index]});
});

app.get("/register", async (req, res) => {
  res.render("register.ejs");
});

app.get("/login", async (req, res) => {
  res.render("login.ejs");
});



app.get("/user", async (req, res) => {
  if(req.isAuthenticated()){
    user = req.session.passport.user;
    const result = await db.query("SELECT * FROM entries WHERE user_id = $1", [user.id]);
    posts = result.rows;
    console.log(posts);
    console.log('request is authenticated');
    res.render("user.ejs", {posts:posts});
  } else {
    res.redirect('/login');
  }
});

app.get("/lookup", async (req, res) => {
  if(req.isAuthenticated()){
    const result = await db.query("SELECT * FROM entries WHERE user_id = $1", [lookup.id]);
    posts = result.rows;
    res.render('search.ejs',{user:lookup,posts:posts});
  console.log(user);
  } else {
    res.redirect('/login');
  }
});

app.post("/lookup", async (req, res) => {
  lookup = req.body;
  console.log(lookup);
  res.redirect('/lookup');
});

app.post("/search", async (req, res) => {
  console.log(req.body);
  var name = req.body.name.toLowerCase();
  const result = await db.query("SELECT id,name FROM users WHERE name LIKE '%' || $1 || '%' ",[name]);
  console.log(result.rows);
  var searchResult = result.rows;

if(result.rows.length==0){
  var notfound = 'the user was not found';
  res.render('search.ejs',{notfound:notfound});
} else if(result.rows.length>1){
  res.render('options.ejs',{users:searchResult});
} else {
  lookup = result.rows[0];
  res.redirect('/lookup');
}
});



app.post("/delete", async (req, res) => {
  var entry_id= req.body.id;
  try{
    await db.query('DELETE FROM entries WHERE id=$1',[entry_id]);
    console.log('entry was deleted succesfully');
    res.redirect('/user');
  }catch(err){
    console.log(err);
  }
});

app.post("/new", async (req, res) => {
  console.log(req.body);
  console.log(user);
  var user_id=user.id;
  var game = req.body.game;
  var description = req.body.description;
  var rating = req.body.rating;
  try{
    const result = await axios.get(API_URL + `?title=` + game );
    if(result.data.length>0){
       var img =  result.data[0].thumb;
    }
    await db.query('INSERT INTO entries (game,description,rating,user_id,img) VALUES ($1,$2,$3,$4,$5)',[game,description,rating,user_id,img]);
    console.log('new entry was added succesfully');
    res.redirect('/user');
  }catch(err){
    console.log(err);
  }
});

app.post("/edit/:id", async (req, res) => {
  console.log(req.body);
  var entry_id= req.body.id;
  var game = req.body.game;
  var description = req.body.description;
  var rating = req.body.rating;
  try {
    const result = await axios.get(API_URL + `?title=` + game );
    if(result.data.length>0){
       var img =  result.data[0].thumb;
    }
    await db.query('UPDATE entries SET game=$1,description=$2,rating=$3,img=$4 WHERE id = $5',[game,description,rating,img,entry_id]);
    console.log('edit was made succesfully');
    res.redirect('/user'); 
  }catch(err){
    console.log(err);
  }
});

app.post('/register', async (req, res) => {
  const email = req.body.username;
  const loginPassword = req.body.password;
  const name = req.body.name.toLowerCase();
  console.log(req.body);
  try{
    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      email]);
      if (result.rows.length > 0){
        const user = result.rows[0];
        const storedHashedPassword = user.password;
        bcrypt.compare(loginPassword, storedHashedPassword, function(err, result) {
          if (err){
            console.log('error comparing passwords',err);
          } else if (result){
            posts = [];
            res.redirect('/user');
          } else{
            res.redirect('/login');
          }
      });
      } else{
        bcrypt.hash(loginPassword, saltRounds, async function(err, hash) {
          // Store hash in your password DB.
          if(err){
            console.log('error hashing password:',err);
          }else{
            const result = await db.query('INSERT into users (email,password,name) VALUES ($1,$2,$3) RETURNING *',[email,hash,name]);
            const user = result.rows[0];
            req.login(user, (err) => {
            console.log("success");
            posts = [];
            res.redirect('/user');
          });
          }
          
      });
      }
  } catch(err){
    console.log(err);
  }
});

app.post("/login",
     passport.authenticate('local', {
       successRedirect: "/user",
       failureRedirect: "/login",
     })
);

passport.use(
  "local",
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1 ", [
        username,
      ]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashedPassword = user.password;
        bcrypt.compare(password, storedHashedPassword, (err, valid) => {
          if (err) {
            console.error("Error comparing passwords:", err);
            return cb(err);
          } else {
            if (valid) {
              posts = [];
              return cb(null, user);
            } else {
              return cb(null, false);
            }
          }
        });
      } else {
        return cb("User not found");
      }
    } catch (err) {
      console.log(err);
    }
  })
);

passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
