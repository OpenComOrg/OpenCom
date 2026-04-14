# OpenCom

An open source communication platform

## Go Backend Rewrite:

**INFO: THIS IS NOT FINAL AND WILL BE CHANGED**

I intend to rewrite the Backend API and seperate services using Go , this is because I am looking into improving the platform's codebase as a whole

## Info:

- This is a README rewrite as my prior one was written by AI and im not particualrly proud of that, so we ball ig. Please notify / tell me of any misisng bits and I will get to them anyways we ball ig.

- This is gonna be as comprehensive as I can write it easily, but please note there may or may not be some difficulties due ot my admitadly lack of skill at README's [:sob:]

- Anyways for the people who are about to read my extravaganzer of a readme Good luck kind soul :pray:

## Feature List:

**[NOTE IF ITS MISSING SOMETHING PLEASE JUST OPEN A ISSUE AND IT WILL BE FIXED]**

**OpenCom Core**

- Account Management Endpoints

- Private DMS

- Main gateway handelling 

- Boost Handelling

- Invite Service

- The officail account / messaging service stuff

**OpenCom Node**

- **Official Node**
  - Server handelling for non self hosted
  - Server handelling in general
  - All features included in self hosted
  - running the official server admin panel [I think may be wrong tho, this codebase is massive lmfao]

- **Self Hosted**
  - Server Creation hosted purely by user
  - Channels / Categories [similar to discord]
  - Voice Calls / Channels
  - Roles
  - Fully functional guild stuff

**OpenCom Frontend**

**[NOTE IF YOU ARE USING OPENCOM AS IN THE MAIN PLATFORM THIS IS NOT SELF HOSTED]**

- Fully inclusive frontend [ig this is obvious but like we ball ig]

- DM's 

- Server interaction layer

- I'm negl i have no idea how to explain the frontend but the gist is here so enjoy ig as said im bad at this



## Project Roadmap

**TODO LIST**
 
- [x] Finish Mobile APP [maybe this is a 50/50]

- [x] Add more callbacks to the github in the frontend

- [x] Overall improvemnets to the platform

- [x] Make the actual day to day running of OpenCom easier for both self hosted and core

- [x] Improve Client handelling

- [ ] Make .deb Package actually have the icon [for some reason it dosent]

- [x] Overall improve everything else [more just small improvements to small for individual mentions]


## Hosting A server node

Im assuming this is what most of you are here for so here it goes.

- simply its going to scripts/ops and running ./create-server.sh and following through the args in that

- then once having setup the node running ./start-server.sh {server-name}

- In an ideal world this should just be this simple if its not please open a issue or pull request and i'll get to fixing it


## Support the project

**[NOTE THIS PURELY OPTIONAL ANYTHING DONE WILL BE A MASSIVE HELP IN THE DAY TO DAY RUNNING AND DEVELOPMENT OF THIS]**

The sole and only way to really support OpenCom is through the boost subscription service offered within the application, this is designed to help fund the platform as I have done it to make it as fully functioanl without boost whilst also making it worth it to those looking to support :). 


## Actually running the project

**[THIS IS DESIGNED FOR IF YOU ACTUALLY HAVE IT ALREADY SETUP IN A ENV]**

- Cd into the dir

- Run ./start.sh [ or docker-compose up / docker compose up (if thats working)]

- In either case ensure it runs correctly 

## Dev reset / reconfigure

- If your local config is cooked and you just want to wipe it all and rebuild it cleanly, run `./scripts/dev/reconfigure.sh --yes`

- That will regenerate local backend/frontend env files, clear local backend runtime state, recreate the local database stack, and rerun migrations

- If you want the optional local object storage too, use `./scripts/dev/reconfigure.sh --yes --with-minio`

## Docker launchers

- You can now use `./docker/dev` for local Docker-driven development and `./docker/prod` for Docker-run hosting

- Both support `all` or `node`

- `all` starts the full stack: databases, redis, core, node, and frontend

- `node` starts the backend-only stack: databases, redis, core, and node

- First `./docker/dev up ...` run does a best-effort backup and then a full `reconfigure`

- First `./docker/prod up ...` run just does the best-effort backup and leaves your config alone

- Example: `./docker/dev all`

- Example: `./docker/dev up node`

- Example: `./docker/prod up all`

- Example: `./docker/prod status`
