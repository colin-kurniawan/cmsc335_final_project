"use strict";

const path = require("path");

require("dotenv").config({
   path: path.resolve(__dirname, "credentialsDontPost/.env"),
   quiet: true,
});

const mongoose = require("mongoose");
mongoose.connect(process.env.MONGO_CONNECTION_STRING, { dbName: "CMSC335DB" });
const reviewSchema = new mongoose.Schema({
    playerName: String,
    rating: String,
    reviewMessage: String
});
const Review = mongoose.model("Review", reviewSchema, "playerReviews");

const playerCache = {};
const playerDataCache = {};

function main(){
    process.stdin.setEncoding("utf8");
    if(process.argv.length !== 2){
        console.log('Usage basketballServer.js');
        process.exit(1);
    }
    else {
        process.stdin.setEncoding("utf8");
        const express = require("express");
        const app = express(); 
        const bodyParser = require("body-parser");
        const router = express.Router(); 
        const portNumber = 5000;

        app.use(bodyParser.urlencoded({ extended: false }));
        app.use(express.static(path.resolve(__dirname, "")));
        
        const prompt = `Stop to shutdown the server: `;
        app.listen(portNumber, (err) => {
          if (err) {
            console.log("Starting server failed.");
          } else {
            console.log(`Web server started and running at http://localhost:${portNumber}`);
            process.stdout.write(prompt);
          }
        });

        process.stdin.on("readable", function () {
            const input = process.stdin.read();
            if(input !== null){
                const command = input.trim();
                if(command === 'stop'){
                    console.log("Shutting down the server");
                    process.exit(0);
                }
                else{
                    console.log(`Invalid command: ${command}`);
                }

                process.stdout.write(prompt);
                process.stdin.resume();
            }
        });

        app.set("view engine", "ejs");
        app.set("views", path.resolve(__dirname, "templates"));
        app.use("/", router);
        app.get("/", (request, response) => {
            response.render("index");
        });

        app.get("/search", async (request, response) => {
            const searchName = request.query.player;
            try {
                const players = await searchPlayers(searchName);
                response.render("processSearchPlayer", { players, searchName });
            } catch (err) {
                response.render("processSearchPlayer", { players: [], searchName });
            }
        }); 

        router.get("/reviewPlayer", (request, response) => {
            response.render("playerReview");
        });

        router.post("/submitReview", async (req, res) => {
            const { playerName, rating, reviewMessage } = req.body;
            const submitTime = await addToDatabase(playerName, rating, reviewMessage);
            res.render("processReview", { playerName, rating, reviewMessage, submitTime });
        });

        app.get("/player/:id", async (req, res) => {
            const playerId = req.params.id;

            let playerData;
            if (playerDataCache[playerId]) {
                playerData = playerDataCache[playerId];
            } else {
                const playerResponse = await fetch(`https://api.balldontlie.io/nba/v1/players/${playerId}`, {
                    headers: { "Authorization": process.env.BALLDONTLIE_API_KEY }
                });
                playerData = await playerResponse.json();
                playerDataCache[playerId] = playerData;
            }

            const reviews = await getAllReviews(playerData.data.first_name + " " + playerData.data.last_name);

            let avgRating = 0;
            if (reviews.length > 0) {
                const total = reviews.reduce((sum, r) => sum + Number(r.rating), 0);
                avgRating = (total / reviews.length).toFixed(1);
            }

            res.render("player", { 
                player: playerData.data, 
                reviews: reviews,
                avgRating: avgRating
            });
        });
    }
}

async function searchPlayers(name) {
    if (playerCache[name]) {
        return playerCache[name];
    }

    const apiKey = process.env.BALLDONTLIE_API_KEY; 
    const nameParts = name.trim().split(" ");
    const searchTerm = nameParts[nameParts.length - 1];
    const url = `https://api.balldontlie.io/nba/v1/players?search=${encodeURIComponent(searchTerm)}`;

    const res = await fetch(url, {
        headers: { "Authorization": apiKey }
    });

    if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
    }

    const json = await res.json();

    let results = json.data;
    if (nameParts.length > 1) {
        const firstName = nameParts[0].toLowerCase();
        results = results.filter(p => p.first_name.toLowerCase().startsWith(firstName));
    }

    playerCache[name] = results;
    return results;
}

async function addToDatabase(playerName, rating, reviewMessage) {
    const review = new Review({
        playerName: playerName.toLowerCase(),
        rating: rating,
        reviewMessage: reviewMessage
    });
    await review.save();
}

async function getAllReviews(playerName) {
    try {
        const reviews = await Review.find({ playerName: playerName.toLowerCase() });
        return reviews;
    } catch (e) {
        console.error(e);
        return [];
    }
}

main();