import { config } from "dotenv";
import { Configuration, OpenAIApi } from "openai-edge";
import { OpenAIStream, StreamingTextResponse } from "ai";
import chalk from "chalk";
import prompt from "prompt";
import express from "express";
config();

prompt.message = "";

const app = express();

let images: string[] = [];

app.get("/", (req, res) => {
  res.send(`
    <html>
        <head>
            <title>AI Game</title>
            <script type='script/javascript'>setInterval(() => location.reload(), 500)</script>
            </head>
            <body>
                ${images
                  .map((image) => `<img src="${image}" style='width:800px;'/>`)
                  .join("")}
            </body>
    </html>
            `);
});

app.listen(3000);

const openAiConfig = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(openAiConfig);

async function generateWorld(): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const response = await openai.createChatCompletion({
      model: "gpt-4",
      temperature: 1,
      messages: [
        {
          content:
            "Imagine a fictional world. Describe the world and explain the laws and logic of the world in one sentence. Keep it short. Make the world close to our world. It should either play in the medieval ages or a science future. There are no absurdly weird things happening.",
          role: "user",
        },
      ],
    });
    const json = await response.json();

    const world = json.choices[0].message.content;

    resolve(world);
  });
}

async function generateQuest(world: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const response = await openai.createChatCompletion({
      model: "gpt-4",
      temperature: 1,
      messages: [
        {
          content: `${world} is a world where the player is in. Think of a quest the player must complete. The quest should be short and concise. It should be possible to complete the quest in a few minutes. The quest should be fun and interesting. The quest should be possible. The quest should be short and concise and one sentence. The quest should be simple. Answer in one sentence only. Max 20 words.`,
          role: "user",
        },
      ],
    });
    const json = await response.json();

    const quest = json.choices[0].message.content;

    resolve(quest);
  });
}

async function generateImagePrompt(messages: any[]): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const response = await openai.createChatCompletion({
      model: "gpt-4",
      temperature: 1,
      messages: [
        ...messages,
        {
          content: `Describe the current users situation and environment in a super simple descriptive short sentence. Include the player. Remove any capitalization and punctuation.`,
          role: "user",
        },
      ],
    });
    const json = await response.json();

    const quest = json.choices[0].message.content;

    resolve(quest);
  });
}

async function generateImage(prompt: string) {
  return new Promise(async (resolve, reject) => {
    const response = await openai.createImage({
      prompt,
      size: "256x256",
    });

    const json = await response.json();

    const src = json.data[0].url;

    images = [];
    images.push(src);
  });
}

(async () => {
  console.log("Generating world...");
  const world = await generateWorld();
  console.log("Generating quest...");
  const quest = await generateQuest(world);

  console.clear();

  console.log(`World: ${chalk.green(world)}`);
  console.log(`Quest: ${chalk.green(quest)}`);

  generateImage(world + " realistic");

  const messages = [
    {
      content: `You are a game master providing an interactive experience for a player. 
      Give the player information about their current location. 
      The player is in a "${world}". Answer very short and concise. 
      Every time the player performs an action, you should describe the result of the action and a random event that happens in correlation to the action. 
      The player has no super powers and is bound to the laws of physics.
      He can not do anything that is not possible in the real world.
      The player can only do things that are in his control.
      The player can only complete basic tasks. 
      The player has the quest to "${quest}". 
      When the player dies or the quest is not completable anymore, the game ends and you end your message with 'You lost'. When the player completes the quest, you end your message with 'You won'. 
      You must inform the player, that he can not do something, if he tries to do something that is not possible. The player can only complete single tasks at a time. The player can not do multiple things at once. 
      The player can not control the world in any way.
      The quest should require multiple steps to complete. 
      The quest should be possible to complete within 5 actions.`,
      role: "system",
    },
  ];

  while (true) {
    await new Promise<void>(async (resolve) => {
      console.log("\nWhat do you do?");
      prompt.start();
      const { message } = await prompt.get([
        {
          name: "message",
          message: chalk.blue(">"),
        },
      ]);
      messages.push({
        content: message as string,
        role: "user",
      });

      const response = await openai.createChatCompletion({
        model: "gpt-4",
        stream: true,
        messages: messages as any,
      });

      const stream = OpenAIStream(response);

      const decoder = new TextDecoder();

      let text = "";

      stream.pipeTo(
        new WritableStream({
          write: (chunk) => {
            text += decoder.decode(chunk);
            process.stdout.write(decoder.decode(chunk));
          },
          close: () => {
            if (text.toLowerCase().includes("you won")) {
              console.log(chalk.green("You won!"));
              process.exit(0);
            } else if (text.toLowerCase().includes("you lost")) {
              console.log(chalk.red("You lost!"));
              process.exit(0);
            }
            messages.push({
              content: text,
              role: "assistant",
            });
            generateImagePrompt(messages).then((prompt) => {
              generateImage(prompt + " realistic");
            });
            resolve();
          },
        })
      );
    });
  }
})();
