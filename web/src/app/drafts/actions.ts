"use server";

import { Prisma } from "@/generated/prisma/client";
import { DraftSelectionGroup, DraftStatus, DraftTier, PlayerStatus } from "@/generated/prisma/enums";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/authorization";
import { writeAuditLog } from "@/lib/audit";
import { formDataToRecord } from "@/lib/club-validation";
import { prisma } from "@/lib/prisma";

export type DraftState = { error?: string; fieldErrors?: Record<string, string[] | undefined> };
const draftSchema = z.object({ name:z.string().trim().min(2).max(100),seasonId:z.string().min(1),divisionId:z.string().min(1),tier:z.enum(DraftTier).default(DraftTier.MAIN) });
const pickSchema = z.object({ playerId:z.string().min(1),seasonClubId:z.string().min(1),round:z.coerce.number().int().min(1) });
function failure(error:unknown):DraftState { if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002")return{error:"This player or pick number has already been used."};return{error:"Draft operation failed."}; }

export async function createDraft(_s:DraftState,fd:FormData):Promise<DraftState>{
  await requirePermission("draft:manage");const p=draftSchema.safeParse(formDataToRecord(fd));if(!p.success)return{fieldErrors:p.error.flatten().fieldErrors};
  const valid=await prisma.division.findFirst({where:{id:p.data.divisionId,competition:{seasons:{some:{id:p.data.seasonId}}}},select:{id:true}});
  if(!valid)return{error:"Division does not belong to the season competition."};
  try{const d=await prisma.draft.create({data:p.data});revalidatePath("/drafts");redirect(`/drafts/${d.id}`);}catch(e){unstable_rethrow(e);return failure(e);}
}
export async function setDraftStatus(draftId:string,status:DraftStatus){
  const session=await requirePermission("draft:manage");const now=new Date();
  await prisma.$transaction(async tx=>{
    await tx.draft.update({where:{id:draftId},data:{status,startedAt:status==="LIVE"?now:undefined,completedAt:status==="COMPLETED"?now:null}});
    await writeAuditLog(tx,{userId:session.user.id,action:"DRAFT_STATUS_CHANGED",entityType:"Draft",entityId:draftId,details:{status}});
  });
  revalidatePath("/drafts");revalidatePath(`/drafts/${draftId}`);
}
export async function makeDraftPick(draftId:string,_s:DraftState,fd:FormData):Promise<DraftState>{
  const session=await requirePermission("draft:manage");const p=pickSchema.safeParse(formDataToRecord(fd));if(!p.success)return{fieldErrors:p.error.flatten().fieldErrors};
  try{await prisma.$transaction(async tx=>{
    const draft=await tx.draft.findUniqueOrThrow({where:{id:draftId}});
    if(draft.status!=="LIVE")throw new Error("DRAFT_NOT_LIVE");
    const [player,team]=await Promise.all([
      tx.player.findUnique({where:{id:p.data.playerId},select:{seasonId:true,status:true,seasonClubId:true,draftSelectionGroup:true}}),
      tx.seasonClub.findUnique({where:{id:p.data.seasonClubId},select:{seasonId:true,divisionId:true,status:true}}),
    ]);
    const requiredGroup=draft.tier===DraftTier.MAIN?DraftSelectionGroup.MAIN_DRAFT:DraftSelectionGroup.SECONDARY_DRAFT;
    if(!player||player.seasonId!==draft.seasonId||!["DRAFT_ELIGIBLE","UNDRAFTED"].includes(player.status)||player.seasonClubId||player.draftSelectionGroup!==requiredGroup)throw new Error("PLAYER_INELIGIBLE");
    if(!team||team.seasonId!==draft.seasonId||team.divisionId!==draft.divisionId||team.status!=="ACTIVE")throw new Error("TEAM_INELIGIBLE");
    const pickNumber=draft.nextPickNumber;
    await tx.draftPick.create({data:{draftId,round:p.data.round,pickNumber,seasonClubId:p.data.seasonClubId,playerId:p.data.playerId}});
    await tx.player.update({where:{id:p.data.playerId},data:{seasonClubId:p.data.seasonClubId,status:PlayerStatus.DRAFTED,draftedAt:new Date()}});
    await tx.draft.update({where:{id:draftId},data:{currentRound:p.data.round,nextPickNumber:{increment:1}}});
    await writeAuditLog(tx,{userId:session.user.id,action:"DRAFT_PICK_MADE",entityType:"DraftPick",entityId:`${draftId}:${pickNumber}`,details:{draftId,playerId:p.data.playerId,seasonClubId:p.data.seasonClubId,round:p.data.round,pickNumber}});
  });revalidatePath(`/drafts/${draftId}`);return{};}catch(e){if(e instanceof Error&&e.message==="DRAFT_NOT_LIVE")return{error:"Start the draft before making a pick."};if(e instanceof Error&&e.message==="PLAYER_INELIGIBLE")return{error:"Player is not available in this draft pool."};if(e instanceof Error&&e.message==="TEAM_INELIGIBLE")return{error:"SeasonClub is not eligible for this draft."};return failure(e);}
}
