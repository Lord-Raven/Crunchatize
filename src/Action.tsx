import {Outcome} from "./Outcome";
import {Stat} from "./Stat";

export class Action {
    description: string;
    stat: Stat;
    modifier: number;

    constructor(description: string, stat: Stat, modifier: number) {
        this.description = description;
        this.stat = stat;
        this.modifier = modifier;
    }

    // Method to simulate a dice roll
    diceRoll(): number {
        return Math.floor(Math.random() * 6) + 1;
    }

    // Method to determine success, partial success, or failure
    determineSuccess(skillScore: number): Outcome {
        const dieResult1: number = this.diceRoll();
        const dieResult2: number = this.diceRoll();
        return new Outcome(dieResult1, dieResult2, this.modifier);
    }
}