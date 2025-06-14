import {ReactElement} from "react";
import {StageBase, StageResponse, InitialData, Message, Character, User} from "@chub-ai/stages-ts";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";
import {Action} from "./Action";
import {Stat} from "./Stat"
import {Outcome, Result, ResultDescription} from "./Outcome";
import {env, pipeline} from '@xenova/transformers';
import {Client} from "@gradio/client";

type MessageStateType = any;

type ConfigType = any;

type InitStateType = any;

type ChatStateType = any;

/*
  nvm use 21.7.1
  yarn install (if dependencies have changed)
  yarn dev --host --mode staging
*/

interface SaveState {
    experience: number;
    statUses: {[stat in Stat]: number};
    stats: {[stat in Stat]: number};
    lastOutcome: Outcome|null;
    lastOutcomePrompt: string;
}

export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {
    
    readonly defaultStat: number = 0;
    readonly levelThresholds: number[] = [2, 5, 8, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

    // message-level variables
    userState: {[key: string]: SaveState} = {};

    // other
    client: any;
    fallbackPipelinePromise: Promise<any> | null = null;
    fallbackPipeline: any = null;
    fallbackMode: boolean;
    //player: User;
    users: {[key: string]: User} = {};
    characters: {[key: string]: Character} = {};

    constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {
        super(data);
        const {
            characters,
            users,
            messageState,
        } = data;
        this.users = users;
        this.characters = characters;
        console.log(this.users);
        console.log(this.characters);

        for (let user of Object.values(this.users)) {
            this.userState[user.anonymizedId] = this.initializeUserState();
        }
        this.setStateFromMessageState(messageState);

        this.fallbackMode = false;
        this.fallbackPipeline = null;
        env.allowRemoteModels = false;
    }

    initializeUserState(): SaveState {
        return {
            experience: 0,
            statUses: this.clearStatMap(),
            stats: this.clearStatMap(),
            lastOutcome: null,
            lastOutcomePrompt: ''
        }
    }

    getUserState(anonymizedId: string): SaveState {
        return this.userState[anonymizedId] ?? this.initializeUserState();
    }

    clearStatMap() {
        return {
            [Stat.Might]: 0,
            [Stat.Grace]: 0,
            [Stat.Skill]: 0,
            [Stat.Brains]: 0,
            [Stat.Wits]: 0,
            [Stat.Charm]: 0,
            [Stat.Heart]: 0,
            [Stat.Luck]: 0
        };
    }

    async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {

        try {
            this.fallbackPipelinePromise = this.getPipeline();
        } catch (exception: any) {
            console.error(`Error loading pipeline: ${exception}`);
        }

        try {
            this.client = await Client.connect("Ravenok/statosphere-backend", {hf_token: import.meta.env.VITE_HF_API_KEY});
        } catch (error) {
            console.error(`Error connecting to backend pipeline; will resort to local inference.`);
            this.fallbackMode = true;
        }

        console.log('Finished loading stage.');

        return {
            success: true,
            error: null,
            initState: null,
            chatState: null,
        };
    }

    async getPipeline() {
        return pipeline("zero-shot-classification", "Xenova/mobilebert-uncased-mnli");
    }

    async setState(state: MessageStateType): Promise<void> {
        this.setStateFromMessageState(state);
    }

    async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        const {
            anonymizedId,
            content,
            promptForId
        } = userMessage;

        let errorMessage: string|null = null;
        let takenAction: Action|null = null;
        let finalContent: string|undefined = content;

        if (finalContent) {
            let sequence = this.replaceTags(content,
                {"user": anonymizedId ? this.users[anonymizedId].name : '', "char": promptForId ? this.characters[promptForId].name : ''});

            const statMapping:{[key: string]: string} = {
                'hit, wrestle': 'Might',
                'lift, throw, climb': 'Might',
                'endure, physically intimidate': 'Might',
                'jump, dodge, balance, dance, fall, land, sneak': 'Grace',
                'aim, shoot': 'Skill',
                'craft, lock-pick, pickpocket, repair': 'Skill',
                'ride, steer': 'Skill',
                'memorize, recall, solve, debate': 'Brains',
                'strategize, plan, navigate': 'Brains',
                'quip, trick': 'Wits',
                'adapt, spot, hide': 'Wits',
                'persuade, lie, entice, perform': 'Charm',
                'resist, recover, empathize, comfort': 'Heart',
                'gamble, hope, discover, guess': 'Luck',
                'chat, rest, wait, idle': 'None'};
            let topStat: Stat|null = null;
            const statHypothesis = 'The narrator is doing one of the following: {}, or something similar.'
            const statPromise = this.query({sequence: sequence, candidate_labels: Object.keys(statMapping), hypothesis_template: statHypothesis, multi_label: true });

            const difficultyMapping:{[key: string]: number} = {
                '1 (simple and safe)': 1000,
                '2 (straightforward or fiddly)': 1,
                '3 (complex or tricky)': 0,
                '4 (challenging and risky)': -1,
                '5 (arduous and dangerous)': -2,
                '6 (virtually impossible)': -3};
            let difficultyRating:number = 0;
            const difficultyHypothesis = 'On a scale of 1-6, the difficulty of the narrator\'s actions is {}.';
            let difficultyResponse = await this.query({sequence: sequence, candidate_labels: Object.keys(difficultyMapping), hypothesis_template: difficultyHypothesis, multi_label: true });
            console.log(`Difficulty modifier selected: ${difficultyMapping[difficultyResponse.labels[0]]}`);
            if (difficultyResponse && difficultyResponse.labels[0]) {
                difficultyRating = difficultyMapping[difficultyResponse.labels[0]];
            }

            let statResponse = await statPromise;
            if (statResponse && statResponse.labels && statResponse.scores[0] > 0.1 && statMapping[statResponse.labels[0]] != 'None') {
                topStat = Stat[statMapping[statResponse.labels[0]] as keyof typeof Stat];
                console.log(`Stat selected: ${topStat}`);
            }

            if (topStat && difficultyRating < 1000) {
                takenAction = new Action(finalContent, topStat, difficultyRating, this.getUserState(anonymizedId).stats[topStat]);
            } else {
                takenAction = new Action(finalContent, null, 0, 0);
            }
        }

        if (takenAction) {
            this.setLastOutcome(anonymizedId, takenAction.determineSuccess());
            finalContent = this.getUserState(anonymizedId).lastOutcome?.getDescription();

            if (takenAction.stat) {
                this.getUserState(anonymizedId).statUses[takenAction.stat]++;
            }

            if (this.getUserState(anonymizedId).lastOutcome && [Result.Failure, Result.CriticalSuccess].includes(this.getUserState(anonymizedId).lastOutcome?.result ?? Result.None)) {
                this.getUserState(anonymizedId).experience++;
                let level = this.getLevel(anonymizedId);
                if (this.getUserState(anonymizedId).experience == this.levelThresholds[level]) {
                    const maxCount = Math.max(...Object.values(this.getUserState(anonymizedId).statUses));
                    const maxStats = Object.keys(this.getUserState(anonymizedId).statUses)
                            .filter((stat) => this.getUserState(anonymizedId).statUses[stat as Stat] === maxCount)
                            .map((stat) => stat as Stat);
                    let chosenStat = maxStats[Math.floor(Math.random() * maxStats.length)];
                    console.log(`Before level up: ${this.getUserState(anonymizedId).stats[chosenStat]}`);
                    this.getUserState(anonymizedId).stats[chosenStat]++;
                    console.log(`After level up: ${this.getUserState(anonymizedId).stats[chosenStat]}`);
                    finalContent += `\n##Welcome to level ${level + 2}!##\n#_${chosenStat}_ up!#`;

                    this.getUserState(anonymizedId).statUses = this.clearStatMap();
                } else {
                    finalContent += `\n###${this.users[anonymizedId].name} has learned from this experience...###`
                }
            }
        }

        return {
            stageDirections: `\n[INST]${this.replaceTags(this.getUserState(anonymizedId).lastOutcomePrompt,{
                "user": this.users[anonymizedId].name,
                "char": promptForId ? this.characters[promptForId].name : ''
            })}\n[/INST]`,
            messageState: this.buildMessageState(),
            modifiedMessage: finalContent,
            systemMessage: null,
            error: errorMessage,
            chatState: null,
        };
    }

    getLevel(anonymizedId: string): number {
        return Object.values(this.getUserState(anonymizedId).stats).reduce((acc, val) => acc + val, 0)
    }

    async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {

        let message = botMessage.content;


        Object.values(this.users).forEach(user => this.getUserState(user.anonymizedId).lastOutcomePrompt = '');

        return {
            stageDirections: null,
            messageState: this.buildMessageState(),
            modifiedMessage: botMessage.content.split(/---|\*\*\*|```/)[0].trim(),
            error: null,
            systemMessage: '---\n```' +
                Object.values(this.users).map(user =>
                `${user.name} - Level ${this.getLevel(user.anonymizedId) + 1} (${this.getUserState(user.anonymizedId).experience}/${this.levelThresholds[this.getLevel(user.anonymizedId)]})\n` +
                `${Object.keys(Stat).map(key => `${key}: ${this.getUserState(user.anonymizedId).stats[key as Stat]}`).join(' | ')}`).join('\n') +
                '```',
            chatState: null
        };
    }

    setStateFromMessageState(messageState: MessageStateType) {
        console.log('messageState:');
        console.log(messageState);
        for (let user of Object.values(this.users)) {
            let userState = this.getUserState(user.anonymizedId);
            userState.stats = this.clearStatMap();
            if (messageState != null) {
                for (let stat in Stat) {
                    userState.stats[stat as Stat] = messageState[user.anonymizedId]?.[stat] ?? messageState[stat] ?? this.defaultStat;
                    userState.statUses[stat as Stat] = messageState[user.anonymizedId]?.[`use_${stat}`] ?? messageState[`use_${stat}`] ?? 0;
                }
                let lastOutcome = messageState[user.anonymizedId]?.['lastOutcome'] ?? messageState['lastOutcome'] ?? null;
                userState.lastOutcome = lastOutcome ? this.convertOutcome(lastOutcome) : null;
                userState.lastOutcomePrompt = messageState[user.anonymizedId]?.['lastOutcomePrompt'] ?? messageState['lastOutcomePrompt'] ?? '';
                userState.experience = messageState[user.anonymizedId]?.['experience'] ?? messageState['experience'] ?? 0;
            }
            this.userState[user.anonymizedId] = userState;
        }
    }

    convertOutcome(input: any): Outcome {
        return new Outcome(input['dieResult1'], input['dieResult2'], this.convertAction(input['action']));
    }

    convertAction(input: any): Action {
        return new Action(input['description'], input['stat'] as Stat, input['difficultyModifier'], input['skillModifier'])
    }

    buildMessageState(): any {
        let messageState: any = {};
        for (let user of Object.values(this.users)) {
            let userState: { [key: string]: any } = {};
            for (let stat in Stat) {
                userState[stat] = this.getUserState(user.anonymizedId).stats[stat as Stat] ?? this.defaultStat;
                userState[`use_${stat}`] = this.getUserState(user.anonymizedId).statUses[stat as Stat] ?? 0;
            }
            userState['lastOutcome'] = this.getUserState(user.anonymizedId).lastOutcome ?? null;
            userState['lastOutcomePrompt'] = this.getUserState(user.anonymizedId).lastOutcomePrompt ?? '';
            userState['experience'] = this.getUserState(user.anonymizedId).experience ?? 0;

            messageState[user.anonymizedId] = userState;
        }
        console.log('buildMessageState:');
        console.log(messageState);
        return messageState;
    }

    setLastOutcome(anonymizedId: string, outcome: Outcome|null) {
        this.getUserState(anonymizedId).lastOutcome = outcome;
        this.getUserState(anonymizedId).lastOutcomePrompt = '';
        if (this.getUserState(anonymizedId).lastOutcome) {
            this.getUserState(anonymizedId).lastOutcomePrompt += `{{user}} has chosen the following action: ${this.getUserState(anonymizedId).lastOutcome?.action.description ?? ''}\n`;
            this.getUserState(anonymizedId).lastOutcomePrompt += `${ResultDescription[this.getUserState(anonymizedId).lastOutcome?.result ?? Result.None]}\n`
            if (Object.values(this.users).length > 1) {
                this.getUserState(anonymizedId).lastOutcomePrompt += `Use third-person language for {{user}}.\n`;
            }
        }
    }

    replaceTags(source: string, replacements: {[name: string]: string}) {
        return source.replace(/{{([A-z]*)}}/g, (match) => {
            return replacements[match.substring(2, match.length - 2)];
        });
    }

    async query(data: any) {
        let result: any = null;
        if (this.client && !this.fallbackMode) {
            try {
                const response = await this.client.predict("/predict", {data_string: JSON.stringify(data)});
                result = JSON.parse(`${response.data[0]}`);
            } catch(e) {
                console.log(e);
            }
        }
        if (!result) {
            if (!this.fallbackMode) {
                console.log('Falling back to local zero-shot pipeline.');
                this.fallbackMode = true;
                Client.connect("Ravenok/statosphere-backend", {hf_token: import.meta.env.VITE_HF_API_KEY}).then(client => {this.fallbackMode = false; this.client = client}).catch(err => console.log(err));
            }
            if (this.fallbackPipeline == null) {
                this.fallbackPipeline = this.fallbackPipelinePromise ? await this.fallbackPipelinePromise : await this.getPipeline();
            }
            result = await this.fallbackPipeline(data.sequence, data.candidate_labels, { hypothesis_template: data.hypothesis_template, multi_label: data.multi_label });
        }
        console.log({sequence: data.sequence, hypothesisTemplate: data.hypothesis_template, labels: result.labels, scores: result.scores});
        return result;
    }

    render(): ReactElement {
        return <></>;
    }

}
