import { Chess } from "chess.js"; // Import the Chess library for game logic


export class StructuredMove {

  constructor(sourceSquare, targetSquare, promotion, timeTakenMS = 0) {
    this.sourceSquare = sourceSquare;
    this.targetSquare = targetSquare;
    this.promotion = promotion;
    this.timeTakenMS = timeTakenMS;
  }

  chessMove() {
    return {
      from: this.sourceSquare,
      to: this.targetSquare,
      promotion: this.promotion, // Always promote to a queen for simplicity
    }
  }

  str() {
    return `${this.sourceSquare}${this.targetSquare}`
  }
}

export class ChessMove {
  /* Class storing a single move. */
  constructor(game, move, whiteMS, blackMS) {
    this.game = game; /* of type chess */
    this.move = move;
    this.whiteTimeMS = whiteMS;
    this.blackTimeMS = blackMS;
  }
}

export class MoveHistory {
  /* Class storing all moves, where each move comes with a pre-move FEN and a post-move FEN as well as the actual move. */
  constructor(startFEN = null) {
    this.startFEN = startFEN;
    this.moves = [];
  }

  addMove(move) {
    this.moves.push(move);
  }

  moveCount() {
    return this.moves.length;
  }

  getMoves() {
    return this.moves;
  }
}