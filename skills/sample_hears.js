/*

WHAT IS THIS?

This module demonstrates simple uses of Botkit's `hears` handler functions.

In these examples, Botkit is configured to listen for certain phrases, and then
respond immediately with a single line response.

*/

var Kinvey = require('kinvey-node-sdk');

module.exports = function(controller) {

    /* Collect some very simple runtime stats for use in the uptime/debug command */
    var stats = {
        triggers: 0,
        convos: 0,
    }

    controller.on('heard_trigger', function() {
        stats.triggers++;
    });

    controller.on('conversationStarted', function() {
        stats.convos++;
    });

    controller.hears(['pending'], 'ambient', async function(bot, message) {
        bot.api.conversations.info({
            token: process.env.BOT_TOKEN,
            channel: message.channel
        }, async function (err, res) {
            var channelName = res.channel.name;
            const dataStore = Kinvey.DataStore.collection("workorders");
            const vehicleDataStore =  Kinvey.DataStore.collection("vehicles");
            var workorders = await getPendingWOForChannel(dataStore, channelName);
            if(workorders.length === 0){
                bot.reply(message, 'There are no pending vehicles for this service');
            } else {
                var vList = await generateVehiclesList(vehicleDataStore, workorders);
                var list = 'List of vehicles pending for '+channelName+' service are as follows: \n'+ vList;
                list = list + 'Reply with `done _number_` to mark service as completed.';
                bot.reply(message, list);
            }
        });
    });

    controller.hears(['done (.*)'],'ambient', function(bot, message) {
        var number = message.match[1];
        number = parseInt(number) - 1;
        if (isNaN(number)) {
            bot.reply(message, 'Please specify a number.');
        } else {
            bot.api.conversations.info({
                token: process.env.BOT_TOKEN,
                channel: message.channel
            }, async function (err, res) {
                var channelName = res.channel.name;
                const dataStore = Kinvey.DataStore.collection("workorders");
                const vehicleDataStore =  Kinvey.DataStore.collection("vehicles");
                var workorders = await getPendingWOForChannel(dataStore, channelName);
                var length = workorders.length;
                if (number < 0 || number >= length) {
                    bot.reply(message, 'Sorry, your input is out of range. Right now there are ' + length + ' vehicles on your list.');
                } else {
                    for(workorderIndex in workorders){
                        if(parseInt(workorderIndex) === number)
                        {
                            var workorder = workorders[workorderIndex];
                            workorder.completed = 1;
                            
                            dataStore.save(workorder)
                            .then(async () => {
                                var vehicleName = await getVehicleName(vehicleDataStore, workorder);
                                bot.reply(message, '~' + vehicleName + '~');
                                if((length - 1) > 0){
                                    var list = await generateVehiclesList(vehicleDataStore, workorders);
                                    bot.reply(message, 'Here are our remaining vehicles for '+channelName+' service:\n' + list);
                                } else {
                                    bot.reply(message, channelName+' service for all vehicles is completed!');
                                }

                                var vehicleId = workorder.vehicleId;
                                var status = await setVehicleStatus(dataStore, vehicleDataStore, vehicleId);
                            })
                            .catch((err) => {
                                bot.reply(message, "I experienced error saving the service: "+err);
                            });
                            break;
                        } 
                    }
                }
            });
        }
    });

    async function getPendingWOForChannel(dataStore, channelName){
        var query = new Kinvey.Query();
        query.equalTo('serviceType', channelName);
        query.ascending('_id');
        query.equalTo('completed', 0);
        var workorders = await dataStore.find(query).toPromise();
        return workorders;
    }

    async function generateVehiclesList(vehicleDataStore, workorders) {
        var list = '';
        var index = 0;
        for(workorderIndex in workorders){
            var workorder = workorders[workorderIndex];
            var vehicleName = await getVehicleName(vehicleDataStore, workorder);
            if(workorder.completed === 0) {
                list = list + '> `' +  (index + 1) + '`) ' +  vehicleName + '\n';
                index += 1;
            }
        }
        return list;
    }

    async function getVehicleName(vehicleDataStore, workorder){
        const vehicleId = workorder.vehicleId;
        var vehicle = await vehicleDataStore.findById(vehicleId).toPromise();
        const vehicleName = vehicle.model + ' ' + vehicle.make + ': ' + vehicle.registrationPLate;
        return vehicleName;
    }

    async function setVehicleStatus(dataStore, vehicleDataStore, vehicleId){
        var query = new Kinvey.Query();
        query.equalTo('vehicleId', vehicleId);
        query.equalTo('completed', 0);
        var vehicleWorkorders = await dataStore.find(query).toPromise();
        if(vehicleWorkorders.length === 0){
            var vehicle = await vehicleDataStore.findById(vehicleId).toPromise();
            vehicle.readyToPick = 1;
            return await vehicleDataStore.save(vehicle);
        }
    }

};
