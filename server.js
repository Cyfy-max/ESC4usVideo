var express = require("express");
var app = express();
var http = require("http").createServer(app);

var mongodb = require("mongodb");
var mongoClient = mongodb.MongoClient;
var ObjectId = mongodb.ObjectID;

var bodyParser = require("body-parser");
var bcrypt = require("bcrypt");

var formidable = require("formidable");
var fileSystem = require("fs");
var {getVideoDurationInSeconds} = require("get-video-duration")


var expressSession = require("express-session");
app.use(expressSession({
    "key":"user_id",
    "secret":"User secret Object Id",
    "resave": true,
    "saveUninitialized":true
}))
//a func ro return user s document
function getUser(id,callBack){
    database.collection("users").findOne({
        "_id":ObjectId(id)
    },function(error,user){
        callBack(user);
    })
}

app.use(bodyParser.json({
    limit :"1000mb"
}))
app.use(bodyParser.urlencoded( { extended: true, limit: "10000mb", parameterLimit: 1000000 } ));


app.use("/public", express.static(__dirname + "/public"));
app.set("view engine","ejs")
http.listen(3000,function(){
    console.log('Server started')

    mongoClient.connect("mongodb://localhost:27017",function(error,client){
        database = client.db("my_video_streaming");

        app.get("/",function(request,result){
            
            database.collection("videos").find({}).sort({
                "createdAt":-1
            }).toArray(function(error,videos){
                result.render("index",{
                    "isLogin":request.session.user_id ? true:false,
                    "videos":videos
                })
            })
          
        })
        app.get("/signup",function(request,result){
            result.render("signup");
        })
        app.post("/signup",function(request,result){
           database.collection("users").findOne({
               "email":request.body.email
           },function(error,user){
               if(user==null){
                   // not existss
                   //convert  password to hash
                    bcrypt.hash(request.body.password,10,function(error,hash){
                        database.collection("users").insertOne({
                            "name":request.body.name,
                            "email":request.body.email,
                            "password":hash,
                            "coverPhoto":"",
                            "image":"",
                            "image":"",
                            "subscribers":0,
                            "subscriptions":[],
                            "playlists":[],
                            "videos": [],
                            "history":[],
                            "notifications":[]
                        },function(error,data){
                            result.redirect("/login")
                        });
                    });


               }else{
                   result.send("Email already exists")
               }
           })
        })
        app.get("/login",function(request,result){
            result.render("login",{
                "error":"",
                "message":""
            });
        })

        app.post("/login",function(request,result){
            //check if email exist

            database.collection("users").findOne({
                "email":request.body.email
            },function(error,user){
                if(user == null){
                    result.send("Email does not exists");
                }else{
                    //compare ahshed password
                    bcrypt.compare(request.body.password,user.password,function(error,isVerify){
                        if(isVerify){
                            //
                            request.session.user_id = user._id
                            result.redirect("/");
                        }else{
                            result.send("Password is not correct")
                        }
                    })
                }
            })
        })
        app.get("/logout",function(request,result){
            request.session.destroy();
            result.redirect("/");
        })

        app.get("/upload",function(request,result){
            if(request.session.user_id){
                result.render("upload",{
                    "isLogin":true
                })
            }else{
                result.redirect("/login")
            }
        })
        app.post("/upload-video",function(request,result){
            if(request.session.user_id){
                var formData = new formidable.IncomingForm();
				formData.maxFileSize = 1000 * 1024 * 1204;
                formData.parse(request,function(error,fields,files){
                    var title = fields.title;
                    var description = fields.description;
					var tags = fields.tags;
                    var category = fields.category;

                    var oldPathThumbnail = files.thumbnail.path;
					var thumbnail = "public/thumbnails/" + new Date().getTime() + "-" + files.thumbnail.name;
                     
                    fileSystem.rename(oldPathThumbnail, thumbnail, function (error) {
					//
					});
                    var oldPathVideo = files.video.path;
                    var newPath = "public/videos/"+new Date().getTime()+"-"+files.video.name

                    fileSystem.rename(oldPathVideo,newPath,function(error){
                        //get user data to save iin videos document
                        getUser(request.session.user_id,function(user){
                            var currentTime = new Date().getTime();

                            getVideoDurationInSeconds(newPath).then(function(duration){
                                var hours = Math.floor(duration/60/60);
                                var minutes = Math.floor(duration/60)-(hours*60);
                                var seconds = Math.floor(duration%60);

                                //insert in database
                                database.collection("videos").insertOne({
                                    "user":{
                                        "_id":user._id,
                                        "name":user.name,
                                        "image":user.image,
                                        "subscribers":user.subscribers,

                                    },
                                    "filePath" : newPath,
                                    "thumbnail": thumbnail,
                                    "title":title,
                                    "description":description,
                                    "tags":tags,
                                    "category":category,
                                    "createdAt":currentTime,
                                    "minutes":minutes,
                                    "seconds":seconds,
                                    "hours":hours,
                                    "watch":currentTime,
                                    "views":0,
                                    "playlist":"",
                                    "likers":[],
                                    "dislikers":[],
                                    "comments":[]

                                },function(error,data){
                                    //insert in users collection too
                                    database.collection("users").updateOne({
                                        "_id":ObjectId(request.session.user_id)
                                    },{
                                        $push:{
                                            "videos":{
                                                "_id":data.instertedId,
                                                "title":title,
                                                "views":0,
                                                "thumbnail":thumbnail,
                                                "watch":currentTime
                                            }
                                        }
                                    })
                                    result.redirect("/");
                                });
                            })

                        })
                    })

                })
            }else{
                    result.redirect("/login");
            }
        })
        app.get("/watch/:watch",function(request,result){
            database.collection("videos").findOne({
                "watch":parseInt(request.params.watch)
            },function(error,video){
                if(video==null){
                    result.send("Video does not exist")
                }else{
                    database.collection("videos").updateOne({
                        "_id":ObjectId(video._id)
                    },{
                        $inc:{
                            "views":1
                        }
                    })

                    result.render("video-page/index",{
                        "isLogin":request.session.user_id ? true:false,
                        "video":video
                    })
                }
            })
        })
        app.post("/do-like",function(request,result){
           if(request.session.user_id){
               //check if already liked
            database.collection("videos").findOne({
                $and:[{
                     "_id":ObjectId(request.body.videoId)
                },{
                    "likers._id":request.session.user_id
                }]
            },function(error,video){
                if(video==null){
                        //push in likers array
                        database.collection("videos").updateOne({
                            "_id":ObjectId(request.body.videoId)

                        },{
                            $push:{
                                "likers":{
                                    "_id":request.session.user_id
                                }
                            }
                        },function(error,data){
                            result.json({
                                "status":"success",
                                "message":"Video has been liked"
                            })
                        })
                }else{
                    result.json({
                        "status":"error",
                        "message":"Already liked this video"
                    })
                }
            })

           }else{
            result.json({
                "status":"error",
                "message":"Please login"
            })
           }
        })
        app.post("/do-dislike",function(request,result){
            if(request.session.user_id){
                //check if already liked
             database.collection("videos").findOne({
                 $and:[{
                      "_id":ObjectId(request.body.videoId)
                 },{
                     "dislikers._id":request.session.user_id
                 }]
             },function(error,video){
                 if(video==null){
                         //push in likers array
                         database.collection("videos").updateOne({
                             "_id":ObjectId(request.body.videoId)
 
                         },{
                             $push:{
                                 "dislikers":{
                                     "_id":request.session.user_id
                                 }
                             }
                         },function(error,data){
                             result.json({
                                 "status":"success",
                                 "message":"Video has been disliked"
                             })
                         })
                 }else{
                     result.json({
                         "status":"error",
                         "message":"Already disliked this video"
                     })
                 }
             })
 
            }else{
             result.json({
                 "status":"error",
                 "message":"Please login"
             })
            }
         })
         app.post("/do-comment",function(request,result){
           if(request.session.user_id){
                getUser(request.session.user_id,function(user){
                    database.collection("videos").findOneAndUpdate({
                        "_id":ObjectId(request.body.videoId)
                    },{
                        $push:{
                          "comments":{
                              "_id":ObjectId(),
                              "user":{
                                  "_id":user._id,
                                  "name":user.name,
                                  "image":user.image

                              },
                              "comment":request.body.comment,
                              "creadetAt":new Date().getTime(),
                              "replies":[]
                          }
                        }
                    },function(error,data){
                        var channelId = data.value.user._id;
                        database.collection("users").updateOne({
                            "_id":ObjectId(channelId)
                        },{
                            $push:{
                                "notifications":{
                                    "_id":ObjectId(),
                                    "type":"new_comment",
                                    "content":request.body.comment,
                                    "is_read":false,
                                    "video_watch":data.value.watch,
                                    "user":{
                                        "_id":user._id,
                                        "name":user.name,
                                        "image":user.image
                                    }
                                }
                            }
                        })
                        result.json({
                            "status":"success",
                            "message":"Comment has been posted",
                            "user":{
                                "_id":user._id,
                                "name":user.name,
                                "image":user.image
                            }
                        })
                    })
                })
           }else{
            result.json({
                "status":"error",
                "message":"Please login"
            })
           }
        })
     app.post("/do-reply",function(request,result){
         if(request.session.user_id){
             var reply = request.body.reply;
             var commentId = request.body.commentId;

             getUser(request.session.user_id,function(user){
                 database.collection("videos").findOneAndUpdate({
                     "comments._id":ObjectId(commentId)
                 },{
                     $push:{
                         "comments.$.replies":{
                             "_id":ObjectId(),
                             "user":{
                                 "_id":user._id,
                                 "name":user.name,
                                 "image":user.image
                             },
                             "reply":reply,
                             "creadetAt":new Date().getTime()
                         }
                     }
                 },function(error1,data){
                     var videoWatch = data.value.watch;
                     for(var a=0;a<data.value.comments.length;a++){
                         var comment = data.value.comments[a];

                         if(comment._id==commentId){
                             var _id = comment.user._id;
                             database.collection("users").updateOne({
                                 "_id":ObjectId(_id)
                             },{
                                 $push:{
                                     notifications:{
                                         "_id":ObjectId(),
                                         "type":"new_reply",
                                         "content":reply,
                                         "is_read":false,
                                         "video_watch":videoWatch,
                                         "user":{
                                             "_id":user._id,
                                             "name":user.name,
                                             "image":user.image
                                         }
                                     }
                                 }
                             })
                             break;
                         }
                     }
                     result.json({
                         "status":"success",
                         "message":"Reply has been posted",
                         "user":{
                             "_id":user._id,
                             "name":user.name,
                             "image":user.image
                         }
                     })
                 })
             })
         }else{
             result.json({
                 "status":"error",
                 "message":"Please login to perform this action"
             })
         }
     })
     app.post("/do-subscribe",function(request,result){
        if(request.session.user_id){
            database.collection("videos").findOne({
                "_id":ObjectId(request.body.videoId)
            },function(error1,video){
                if(request.session.user_id==video.user._id){
                    result.json({
                        "status":"error",
                        "message":"You can not give yourself 12 points!"

                    })
                }else{
                    //check if channel is already subscribed
                    getUser(request.session.user_id,function(myData){
                        var flag = false;
                        for(var a =0;a<myData.subscriptions.length;a++){
                            if(myData.subscriptions[a]._id.toString()==video.user._id.toString()){
                                flag = true;
                                break;
                            }
                        }
                        if(flag){
                            result.json({
                                "status":"error",
                                "message":"Already given 12 points"
                            });
                        }else{
                            database.collection("users").findOneAndUpdate({
                                "_id":video.user._id
                            },{
                                $inc:{
                                    "subscribers":1
                                }
                            },{
                                returnOriginal:false
                            },function(error2,userData){
                                database.collection("users").updateOne({
                                    "_id":ObjectId(request.session.user_id)
                                },{
                                    $push:{
                                        "subscriptions":{
                                            "_id":video.user._id,
                                            "name":video.user.name,
                                            "subscribers":userData.value.subscribers,
                                            "image":userData.value.image
                                        }
                                    }
                                },function(error3,data){
                                    database.collection("videos").findOneAndUpdate({
                                        "_id":ObjectId(request.body.videoId)
                                    },{
                                        $inc:{
                                           "user.subscribers":1
                                        }
                                    })
                                    result.json({
                                        "status":"success",
                                        "message":"12 points sent"
                                    })
                                })
                            })
                        }
                    })
                }
            })
        }else{
            result.json({
                "status":"error",
                "message":"Please login to perform this action"
            })
        }
     })
     app.get("/get-related-videos/:category/:videoId",function(request,result){
         database.collection("videos").find({
             $and:[{
                 "category":request.params.category
             },{
                 "_id":{
                     $ne:ObjectId(request.params.videoId)
                 }
             }]
         }).toArray(function(error,videos){
             for(var a=0;a<videos.length;a++){
                 var x = videos[a];
                 var y = Math.floor(Math.random()*(a+1));
                 videos[a]=videos[y];
                 videos[y] = x;
             }
             result.json(videos);
         })
     })
     app.post("/save-history",function(request,result){
         if(request.session.user_id){
             database.collection("videos").findOne({
                 "_id":ObjectId(request.body.videoId)
             },function(error,video){
                 database.collection("users").findOne({
                     $and:[{
                         "_id":ObjectId(request.session.user_id)
                     },{
                         "history.videoId" : request.body.videoId
                     }]
                 },function(error,history){
                     if(history==null){
                         database.collection("users").updateOne({
                             "_id":ObjectId(request.session.user_id)
                         },{
                             $push:{
                                 "history":{
                                     "_id":ObjectId(),
                                     "videoId":request.body.videoId,
                                    "watch":video.watch,
                                    "title":video.title,
                                    "watched":request.body.watched,
                                    "thumbnail":video.thumbnail,
                                    "minutes":video.minutes,
                                    "seconds":video.seconds
                                 }
                             }
                         });
                         result.json({
                             "status":"success",
                             "message":"History has been added"
                         });
                     }else{
                         database.collection("users").updateOne({
                             $and:[{
                                 "_id":ObjectId(request.session.user_id)
                             },{
                                 "history.videoId":request.body.videoId
                             }]
                         },{
                             $set:{
                                 "history.$.watched":request.body.watched
                             }
                         });
                         result.json({
                             "status":"success",
                             "message":"History has been updated"
                         })
                     }
                 })
             })
         }else{
             result.json({
                 "status" :"error",
                 "message":"Please login to perform this action"
             })
         }
     })
        app.get("/watch-history",function(request,result){
            if(request.session.user_id){
                getUser(request.session.user_id,function(user){
                    result.render("watch-history",{
                        "isLogin":true,
                        "videos":user.history
                    });
                });
            }else{
                result.redirect("/login");
            }
        })
        app.post("/delete-from-history",function(request,result){
            if(request.session.user_id){
                database.collection("users").updateOne({
                    $and:[{
                        "_id":ObjectId(request.session.user_id)
                    },{
                        "history.videoId":request.body.videoId
                    }]
                },{
                    $pull:{
                        "history":{
                            "videoId":request.body.videoId
                        }
                    }
                })
                result.redirect("/watch-history");
            }else{
                result.redirect("/login");
            }
        })
    })
})