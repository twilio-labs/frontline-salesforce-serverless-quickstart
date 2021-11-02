const jwt = require('jsonwebtoken');
const jsforce = require('jsforce');
const axios = require('axios');
var querystring = require('querystring');

exports.sfdcAuthenticate = async (context, worker) => {
    const salesforceUsername = worker ? worker : context.SF_USERNAME;
    const twilioClient = context.getTwilioClient();
    try {
        const syncDoc = await twilioClient.sync
            .services(context.SYNC_SERVICE_SID)
            .documents(salesforceUsername)
            .fetch();
        const connection = new jsforce.Connection({
            accessToken: syncDoc.data.access_token,
            instanceUrl: context.SFDC_INSTANCE_URL
        });
        const identityInfo = await connection.identity();
        return { connection, identityInfo }
    } catch (e) {
        console.log('Auth error: ', e);
        if ((e.status === 404 && e.code === 20404) || e.errorCode === 'INVALID_SESSION_ID') {
            const newTokens = await signJwtAndRequestNewTokens(context, salesforceUsername);
            const connection = new jsforce.Connection({
                accessToken: newTokens.access_token,
                instanceUrl: context.SFDC_INSTANCE_URL
            });
            const identityInfo = await connection.identity();
            await updateTokenCache(context, twilioClient, connection, identityInfo);
            return { connection, identityInfo }
        }
    }
};

const signJwtAndRequestNewTokens = async (context, salesforceUsername) => {
    const threeMinutesFromNowInSeconds = Math.floor(Date.now() / 1000) + 3 * 60;
    const claim = {
        iss: context.SF_CONSUMER_KEY,
        aud: 'https://login.salesforce.com',
        prn: salesforceUsername,
        exp: threeMinutesFromNowInSeconds
    };
    const openKey = Runtime.getAssets()['/server.key'].open;
    const key = openKey();
    const jwtToken = jwt.sign(claim, key, { algorithm: 'RS256' });
    const params = {
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwtToken
    };
    try {
        const response = await axios.post(
            'https://login.salesforce.com/services/oauth2/token',
            querystring.stringify(params),
        );
        const newTokens = response.data;
        return newTokens;
    } catch (e) {
        console.error(e);
    }
};

const updateTokenCache = async (context, twilioClient, connection, identityInfo) => {
    try {
        const createdDocument = await twilioClient.sync.
            services(context.SYNC_SERVICE_SID)
            .documents
            .create({
                uniqueName: identityInfo.username,
                data: {
                    access_token: connection.accessToken,
                    refresh_token: connection.refreshToken,
                },
            });
        console.log(
            `Created initial tokens for ${identityInfo.username} 
            in Doc SID ${createdDocument.sid}`,
        );
    } catch (e) {
        console.error(e);
        if (e.status === 409 && e.code === 54301) {
            const updatedDocument = await twilioClient.sync
                .services(context.SYNC_SERVICE_SID)
                .documents(identityInfo.username)
                .update({
                    data: {
                        access_token: connection.accessToken,
                        refresh_token: connection.refreshToken,
                    },
                });
            console.log(
                `Updated tokens for ${identityInfo.username} 
                in Doc SID ${updatedDocument.sid}`,
            );
        } else {
            console.error('Unknown error occurred');
        }
    }
};