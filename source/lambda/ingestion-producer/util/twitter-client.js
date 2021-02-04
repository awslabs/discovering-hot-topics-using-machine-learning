/**********************************************************************************************************************
 *  Copyright 2020-2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.                                      *
 *                                                                                                                    *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance    *
 *  with the License. A copy of the License is located at                                                             *
 *                                                                                                                    *
 *      http://www.apache.orglicenses/LICENSE-2.0                                                                     *
 *                                                                                                                    *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES *
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions    *
 *  and limitations under the License.                                                                                *
 *********************************************************************************************************************/

"use strict"

const Twit = require('twitter-lite');
const AccountSecrets = require('./account-secrets');
const FeedTracker = require('./feed-tracker');

class TwitterClient {
    constructor (accountName) {
        this.accountName = accountName;
        this.feedTracker = new FeedTracker(accountName);
    }

    async init() {
        //retrieve secrets
        const accountSecrets = new AccountSecrets();
        const secretString = await accountSecrets.getSecretValue(this.accountName);

        // initialize the twitter client
        const twitterClient = new Twit({
            subdomain: 'api',
            version: '1.1',
            bearer_token: secretString
        });

        return twitterClient;
    }

    async searchTweets(twitParams) {
        const twit = await this.init();

        twitParams.since_id = await this.feedTracker.getIDFromTracker(twitParams.lang);
        console.debug(`Tweet search parameters is ${JSON.stringify(twitParams)}`);

        let response = null;
        try {
            response = await twit.get("search/tweets", twitParams);
            console.debug(`HTTP Status Code: ${response._headers.get('status')} Rate: ${response._headers.get('x-rate-limit-remaining')} / ${response._headers.get('x-rate-limit-limit')}`);
        } catch (error) {
            if ('errors' in error) {
                // Twitter API errors
                if (error.errors[0].code === 88) {
                    console.warn(`Rate limit will reset on: ${new Date(error._headers.get("x-rate-limit-reset") * 1000)}`);
                    console.warn(`The headers from the API call are: ${JSON.stringify(error._headers)}`);
                } else {
                    console.error('Twitter API throw error: ', error);
                }
                throw error;
            } else {
                console.error('Generic error when calling Twitter API: ', error);
                throw error;
            }
        }

        const jsonData = response.statuses;
        console.debug(`Received ${jsonData.length} with the following query: ${response.search_metadata.query}`);

        // if max_id_str is undefined that means there are no further tweets available and hence tracker is not updated
        // max_id_str is a pagination counter for the search query
        if (response.search_metadata.max_id_str !== undefined) {
            await this.feedTracker.updateTracker(response.search_metadata, jsonData.length, twitParams.lang);
        }

        return jsonData;
    }

    /**
     * The method returns limit remaining. If the response for the bearer token has not exceeded limits, it will return a non-zero value.
     * If the limit has exceeded it will return 0.
     */
    async hasLimit(resources) {
        const twit = await this.init();
        const limitResponse = (await twit.get('application/rate_limit_status', {
            resources: resources
        })).resources.search['/search/tweets'];
        console.debug(`Rate: ${limitResponse.remaining}/${limitResponse.limit} - Reset:${Math.ceil(((limitResponse.reset * 1000) - Date.now())/1000/60)} minutes`);
        return limitResponse.remaining;
    }
}

module.exports = TwitterClient;
