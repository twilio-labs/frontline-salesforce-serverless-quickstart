const sfdcAuthenticatePath = Runtime.getFunctions()['auth/sfdc-authenticate'].path;
const { sfdcAuthenticate } = require(sfdcAuthenticatePath);

exports.handler = async function (context, event, callback) {
    let response = new Twilio.Response();
    response.appendHeader('Content-Type', 'application/json');
    try {
        console.log('Frontline user identity: ' + event.Worker);
        const sfdcConnectionIdentity = await sfdcAuthenticate(context, event.Worker);
        const { connection } = sfdcConnectionIdentity;
        const outboundNumber = await getWorkerOutboundNumber(event.Worker, connection);
        switch (event.Location) {
            case 'GetProxyAddress': {
                if (event.ChannelType === 'whatsapp') {
                    response.setBody({
                        proxy_address: outboundNumber ?
                            `whatsapp:${outboundNumber}` :
                            context.WHATSAPP_NUMBER
                    });
                } else {
                    response.setBody({
                        proxy_address: outboundNumber || context.SMS_NUMBER
                    })
                }
                break;
            }
            default: {
                console.log('Unknown Location: ', event.Location);
                response.setStatusCode(422);
            }
        }
        return callback(null, response);
    } catch (e) {
        console.error(e);
        response.setStatusCode(500);
        return callback(null, response);
    }
};

const getWorkerOutboundNumber = async (workerIdentity, sfdcConn) => {
    console.log('Getting Worker # for user: ', workerIdentity);
    let sfdcRecords = [];
    try {
        sfdcRecords = await sfdcConn.sobject("User")
            .find(
                {
                    'Username': workerIdentity
                },
                {
                    'MobilePhone': 1,
                }
            )
            .sort({ LastModifiedDate: -1 })
            .limit(1)
            .execute();
        console.log("Fetched # SFDC records for worker # by identity: " + sfdcRecords.length);
        if (sfdcRecords.length === 0) {
            console.log('Did not find outbound number for worker: ' + workerIdentity);
            return;
        }
        const sfdcRecord = sfdcRecords[0];
        console.log('Matched to worker number: ' + sfdcRecord.MobilePhone);
        return sfdcRecord.MobilePhone;
    } catch (err) {
        console.error(err);
    }
};