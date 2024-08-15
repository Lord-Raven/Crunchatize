import {Action} from "./Action";

export enum Result {
    Failure = 'Failure',
    MixedSuccess = 'Mixed Success',
    CompleteSuccess = 'Complete Success',
    CriticalSuccess = 'Critical Success',
    None = 'No Roll Needed'
}

export const ResultDescription: {[result in Result]: string} = {
    [Result.Failure]: `{{user}} will fail to achieve their goal and will actively sour or worsen their situation. Describe {{user}}'s actions and outcomes in your own words as you continue to propel the narrative.`,
    [Result.MixedSuccess]: `{{user}} may achieve their goal, but in an inferior way or at some cost. Describe {{user}}'s actions and outcomes in your own words as you continue to propel the narrative.`,
    [Result.CompleteSuccess]: `{{user}} will successfully achieve what they were attempting and improve their situation. Describe {{user}}'s actions and outcomes in your own words as you continue to propel the narrative.`,
    [Result.CriticalSuccess]: `{{user}} will resoundingly achieve what they were attempting, dramatically improving their situation in incredible fashion or with better-than-dreamed-of results. Describe {{user}}'s actions and outcomes in your own words as you continue to propel the narrative.`,
    [Result.None]: '{{user}} took a risk-free action. Describe their actions and dialog in your own words as you continue to propel the narrative.'
}

export const ResultSpan: {[result in Result]: (input: string) => string} = {
    [Result.Failure]: (input: string) => `<span style="color: red;">${input}</span>`,
    [Result.MixedSuccess]: (input: string) => `<span style="color: darkorange;">${input}</span>`,
    [Result.CompleteSuccess]: (input: string) => `<span style="color: mediumseagreen;">${input}</span>`,
    [Result.CriticalSuccess]: (input: string) => `<span style="color: #b9f2ff;">${input}</span>`,
    [Result.None]: (input: string) => input,
}

export class Outcome {
    result: Result;
    dieResult1: number;
    dieResult2: number;
    action: Action;
    total: number;

    constructor(dieResult1: number, dieResult2: number, action: Action) {
        const total = dieResult1 + dieResult2 + action.difficultyModifier + action.skillModifier;
        this.result = (!action.stat ? Result.None : (dieResult1 + dieResult2 == 12 ? Result.CriticalSuccess : (total >= 10 ? Result.CompleteSuccess : (total >= 7 ? Result.MixedSuccess : Result.Failure))));

        this.dieResult1 = dieResult1;
        this.dieResult2 = dieResult2;
        this.action = action;
        this.total = this.dieResult1 + this.dieResult2 + this.action.difficultyModifier + this.action.skillModifier;
    }

    render() {
        const style = {
            width: '1em',
            height: 'auto'
        };
        return (
            <div>
                {this.result} (
                    <img src={`/assets/dice_${this.dieResult1}.png`} style={style} alt={`D6 showing ${this.dieResult1}`} />
                    <img src={`/assets/dice_${this.dieResult2}.png`} style={style} alt={`D6 showing ${this.dieResult2}`} />
                    + {this.action.difficultyModifier} + {this.action.skillModifier} = {this.total})
            </div>
        );
    }

    getDieEmoji(side: number): string {
        const emojiDice: {[key: number]: string} = {
            1: ResultSpan["Failure"]('\u2680'),
            2: ResultSpan["Mixed Success"]('\u2681'),
            3: ResultSpan["Mixed Success"]('\u2682'),
            4: ResultSpan["Complete Success"]('\u2683'),
            5: ResultSpan["Complete Success"]('\u2684'),
            6: ResultSpan["Critical Success"]('\u2685')
        }
        return emojiDice[side];
    }

    getDescription(): string {
        if (this.action.stat) {
            return `###(${this.action.stat}) ${this.action.description}###\n#${this.getDieEmoji(this.dieResult1)}${this.dieResult1} + ${this.getDieEmoji(this.dieResult2)}${this.dieResult2}${this.action.difficultyModifier >= 0 ? ' + ' : ' - '}${Math.abs(this.action.difficultyModifier)}<sup><sub><sup>(difficulty)</sup></sub></sup>${this.action.skillModifier > 0 ? ` + ${this.action.skillModifier}<sup><sub><sup>(skill)</sup></sub></sup>` : ''} = ${ResultSpan[this.result](`${this.total} (${this.result})`)}#`
        } else {
            return `###(No Check) ${this.action.description}###`;
        }
    }
}