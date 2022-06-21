const PORT = 3000;
const express = require('express');
const app = express();
const path = require('path')

app.use(express.json());

//may or may not need this
app.use(express.urlencoded({extended: false}))

var gParticipants = []
var gSessions = []
var gRounds = []
var gCurrentPartId = 1
var gCurrentSesId = 1
var gCurrentRoundId = 1


//homepage
app.post("/", function (req, res) {
    res.send("Home Page!")
});

//round POST endpoint
app.post("/round", function (req, res) {
    let round = req.body
    let session = lookup(gSessions, (item) => item.sessionId === round.sessionId)
    let condition = validRound(round, session)

    let newObj = update(condition, {
        "roundId": gCurrentRoundId,
        "sessionId": round.sessionId,
        "score": round.score,
        "startTime": round.startTime,
        "endTime": round.endTime
    }, gRounds)
    gCurrentRoundId += 1

    if (newObj === false) {
        res.send("412 Precondition Failed: The precondition given in the request evaluated to false by the server")
    }
    else {
        //Add new session to participant's list of sessions
        session.rounds.push(round.roundId)

        //update session times 
        if (round.startTime < session.startTime) {
            session.startTime = round.startTime
        }
        if (round.endTime > session.endTime) {
            session.endTime = round.endTime
        }
        res.send("201 Created: The request is complete, and a new resource is created - " + JSON.stringify(newObj))

    }
});

//session POST endpoint
app.post("/session", function (req, res) {
    let session = req.body
    let condition = validSession(session, req)

    let newObj = update(condition, {
        "sessionId": gCurrentSesId,
        "participantId": session.participantId,
        "rounds": [],
        "startTime": null,
        "endTime": null
    }, gSessions)
    gCurrentSesId += 1

    if (newObj === false) {
        res.send("412 Precondition Failed: The precondition given in the request evaluated to false by the server")
    }
    else {
        lookup(gParticipants, (item) => item.participantId === session.participantId).sessions.push(session.sessionId)
        res.send("201 Created: The request is complete, and a new resource is created - " + JSON.stringify(newObj))
    }
});

// POST endpoint taking in participant and stores it in memory
app.post("/participant", function (req, res) {
    let participant = req.body
    let newObj = update(validParticipant(participant),{
        "participantId": gCurrentPartId,
        "name": participant.name,
        "age": participant.age,
        "language": participant.language,
        "sessions": []
    }, gParticipants)

    gCurrentPartId += 1

    if (newObj === false) {
        res.send("412 Precondition Failed: The precondition given in the request evaluated to false by the server")
    }
    else {
        res.send("201 Created: The request is complete, and a new resource is created - " + JSON.stringify(newObj))
    }

});

app.get("/participant/profiles/:page", (req, res) => {
    const totalPages = Math.ceil(gParticipants.length / 5)
    if (req.params.page === undefined || req.params.page > totalPages) {
        req.params.page = 1
    }
    res.send(displayProfiles(req.params.page * 5 - 5, req.params.page * 5))
});


// -----------------------------------------------------

//displays all profiles within given interval in string form
function displayProfiles(start, end) {
    let profiles = []

    for (let idx = start; idx < end || idx < gParticipants.length; idx++) {
        let pt = gParticipants[idx]

        let roundCount = 0
        let roundDuration = 0
        let sessionDuration = 0
        let fastestRound = {
            "roundId": Number.MAX_SAFE_INTEGER,
            "duration":  Number.MAX_SAFE_INTEGER
        }
        pt.sessions.forEach(sess => {
            let session = lookup(gSessions, (item) => item.sessionId === sess)
            roundCount += session.rounds.length
            sessionDuration += session.endTime - session.startTime
            session.rounds.forEach(round => {
                let duration = round.endTime - round.startTime
                roundDuration += duration
                if (duration < fastestRound.duration) {
                    fastestRound.roundId = round.roundId
                    fastestRound.duration = duration
                }
            })
        })
        let avgRoundDuration = roundDuration/roundCount
        let avgSessionDuration = sessionDuration/pt.sessions.length

        let profile = {
            "participantId": pt.participantId,
            "name": pt.name,
            "age": pt.age,
            "language":pt.language,
            "numberOfSessions": pt.sessions.length,
            "numberOfRounds": roundCount,
            "avgRoundScore": avgRoundDuration,
            "avgSessionDuration": avgSessionDuration,
            "fastestRound": fastestRound
        }

        profiles.push(profile)
    }

    let response = ""

    profiles.forEach(profile => {
        response += JSON.stringify(profile)
        response += "\n"
    })

    return response
}

//selected first item in list returning true for given function
function lookup(list, func) {
    let desired = undefined
    list.forEach(item => {
        if (func(item)) {
            desired = item
        }
    })

    return desired
}

//updates a given list by adding a new object if criteria are met
function update(condition, newObject, list) {
    //still need to return newObject and HTTP status code
    if (condition) {
        list.push(newObject)
        return newObject
    }
    else {
        return false
    }
    
}

//checks if a string is uppercase
function isUpCase(str) {
    strTwo = str
    return str === strTwo.toUpperCase()
}

//checks validity of participant
function validParticipant(participant) {
    let success = true

    //Check name validity
    var name = participant.name
    if (name.trim() != participant.name) {success = false}
    var words = name.split(" ")
    words.forEach(word => {
        if (!isUpCase(word.substring(0,1))) {
            success = false
        }
    })

    //check age validity
    var age = participant.age
    if (age < 0) {
        success = false
    }

    //check language validity
    var language = participant.language
    if (language != "German" && language != "Japanese" && language != "Turkish") {
        success = false
    }

    return success
}

//checks validity of session
function validSession(session, req) {
    var id = session.participantId

    return gParticipants.length <= id && id > 0
}

//checks validity of round
function validRound(round, session) {
    let success = true
    if (gSessions.length < round.sessionId || round.sessionId < 1 || !validTime(round.endTime, round.startTime, session) || round.score < 0) {
        success = false
    }

    return success

    //local function checking time validity
    function validTime(end, start, session) {
        var rounds = session.rounds
        if ((end - start) > 0 && end > 0 && start > 0 && Math.floor(start) == start && Math.floor(end) == end) {
            valid = true
            rounds.forEach(round => {
                if ((end > round.startTime && end < round.endTime) || (start < round.endTime && start > round.startTime)) {
                    valid = false
                }
            })
            return valid
        }
        else {
            return false
        }
    }
}

app.listen(PORT, () => console.log(`Local server is listening on port ${PORT}`));
