import {Action} from "./Action";

export enum Result {
    Failure = 'Failure',
    PartialSuccess = 'Partial Success',
    CompleteSuccess = 'Complete Success'
}

export const ResultDescription: {[result in Result]: string} = {
    [Result.Failure]: 'The user failed to achieve their goal or actively soured the situation.',
    [Result.PartialSuccess]: 'The user may have achieved their goal, but in an inferior way or at some cost.',
    [Result.CompleteSuccess]: 'The user successfully achieved what they were attempting.'
}

export class Outcome {
    result: Result;
    dieResult1: number;
    dieResult2: number;
    action: Action;

    constructor(dieResult1: number, dieResult2: number, action: Action) {
        const total = dieResult1 + dieResult2 + action.modifier;
        this.result = (total >= 10 ? Result.CompleteSuccess : (total >= 7 ? Result.PartialSuccess : Result.Failure));

        this.dieResult1 = dieResult1;
        this.dieResult2 = dieResult2;
        this.action = action;
    }

    render() {
        const total = this.dieResult1 + this.dieResult2 + this.action.modifier;
        return (
            <div>
                {this.result} (
                    <img src={`./assets/dice_${this.dieResult1}.png`} alt={`D6 showing ${this.dieResult1}`} />
                    <img src={`./assets/dice_${this.dieResult2}.png`} alt={`D6 showing ${this.dieResult2}`} />
                    + {this.action.modifier} = {total})
            </div>
        );
    }
}