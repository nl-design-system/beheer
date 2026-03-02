# Sending a Slack notification in GitHub Actions

To send a message into Slack through GitHub Actions, follow these steps:

1. Install a Slack bot to your workspace.
   This will require approval from a workspace admin.
   The bot needs `chat:write` permissions in order to write to every channel.
   For NL Design System, in the Code For NL workspace, this is already done and the bot is called **NL Design System bot**.

2. Retrieve the Bot User OAuth Token.
   You can find it under [Build](https://app.slack.com/app-settings/T68FXPFQV/A0AB95FM9M2/oauth).
   Only admins can access this bot.

3. In GitHub, on the repository where the GitHub Action will be configured, store the token as an environment secret, for example `SLACK_BOT_TOKEN`.

4. Retrieve the Slack channel ID (right click, "View channel details").
   Store this as a repository secret, for example, `SLACK_CHANNEL_ID`.
   Alternatively, you can test by messaging yourself ("Copy member ID" on your profile).

5. Configure the workflow using `slackapi/slack-github-action`.
   For example:

   ```yaml
   environment: issues

   steps:
     - name: Notify Slack channel of failure
       if: failure()
       uses: slackapi/slack-github-action@91efab103c0de0a537f72a35f6b8cda0ee76bf0a # v2.1.1
       with:
         method: chat.postMessage
         token: ${{ secrets.SLACK_BOT_TOKEN }}
         payload: |
           channel: ${{ secrets.SLACK_CHANNEL_ID }}
           text: |
             *Task X failed*
             Workflow: ${{ github.workflow }} (run #${{ github.run_number }})
             <${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View run>
   ```
