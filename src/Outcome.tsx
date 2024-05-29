export enum Result {
    Failure = 'Failure',
    PartialSuccess = 'Partial Success',
    CompleteSuccess = 'Complete Success'
}

export class Outcome {
    result: Result;
    dieResult1: number;
    dieResult2: number;
    modifier: number;

    constructor(dieResult1: number, dieResult2: number, modifier: number) {
        const total = dieResult1 + dieResult2 + modifier;
        this.result = (total >= 10 ? Result.CompleteSuccess : (total >= 7 ? Result.PartialSuccess : Result.Failure));

        this.dieResult1 = dieResult1;
        this.dieResult2 = dieResult2;
        this.modifier = modifier;
    }

    render() {
        const total = this.dieResult1 + this.dieResult2 + this.modifier;
        return (
            <div>
                {this.result} (
                    <img src={`assets/dice_${this.dieResult1}.png`} alt={`Die showing ${this.dieResult1}`} />
                    <img src={`assets/dice_${this.dieResult2}.png`} alt={`Die showing ${this.dieResult2}`} />
                    + {this.modifier} = {total})
            </div>
        );
    }
}