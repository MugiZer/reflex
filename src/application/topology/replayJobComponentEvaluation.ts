import type { JobRepository } from "../../domain/jobs/jobRepository.js";
import type { ComponentPattern } from "../../domain/topology/componentPatternInterpreter.js";
import { replayUnresolvedOccurrence } from "../../domain/topology/componentPatternPromotion.js";

export class ReplayComponentEvaluationError extends Error {
  constructor(public readonly code:"component_evaluation_not_found"|"promoted_pattern_unavailable",message:string){super(message);}
}

export function replayJobComponentEvaluation(command:{jobId:string;evaluationId:string;patternId:string;patternVersion:string;jobs:JobRepository;patterns:readonly ComponentPattern[]}){
  const original=command.jobs.getComponentEvaluation?.(command.evaluationId);
  if(!original||original.jobId!==command.jobId)throw new ReplayComponentEvaluationError("component_evaluation_not_found","Component evaluation not found.");
  const pattern=command.patterns.find((item)=>item.patternId===command.patternId&&item.version===command.patternVersion&&item.lifecycle==="promoted");
  if(!pattern||!command.jobs.appendComponentEvaluation)throw new ReplayComponentEvaluationError("promoted_pattern_unavailable","Promoted component pattern is unavailable.");
  const replay=replayUnresolvedOccurrence({original,pattern,promotedAt:pattern.promotedAt??original.evaluation.createdAt});
  command.jobs.appendComponentEvaluation(replay);
  return replay;
}
