const validateTokenPath = Runtime.getFunctions()['auth/frontline-validate-token'].path;
const sfdcAuthenticatePath = Runtime.getFunctions()['auth/sfdc-authenticate'].path;

const { validateToken } = require(validateTokenPath);
const { sfdcAuthenticate } = require(sfdcAuthenticatePath);

exports.handler = async function (context, event, callback) {
    let response = new Twilio.Response();
    response.appendHeader('Content-Type', 'application/json');
    try {
        const tokenInfo = await validateToken(context, event.Token);
        console.log('Frontline token user identity: ' + tokenInfo.identity);
        const sfdcConn = await sfdcAuthenticate(context);
        const outboundNumber = await getWorkerOutboundNumber(tokenInfo.identity, sfdcConn);
        if (tokenInfo.identity === event.Worker) {
            switch (event.location) {
                case 'GetProxyAddress': {
                    if (event.Channel.type === 'whatsapp') {
                        response.setBody({
                            proxy_address: outboundNumber || context.WHATSAPP_NUMBER
                        });
                    } else {
                        response.setBody({
                            proxy_address: outboundNumber || context.SMS_NUMBER
                        })
                    }
                    break;
                }
                default: {
                    console.log('Unknown location: ', event.location);
                    response.setStatusCode(422);
                }
            }
            return callback(null, response);
        } else {
            console.error(`Worker in request ${event.Worker} 
                and token ${tokenInfo.identity} mismatch`);
            response.setBody('Authorization failed');
            response.setStatusCode(403);
        }
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