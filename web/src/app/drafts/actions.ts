"use server";

import { Prisma } from "@/generated/prisma/client";
import { DraftSelectionGroup, DraftStatus, DraftTier, PlayerStatus } from "@/generated/prisma/enums";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { writeAuditLog } from "@/lib/audit";
import { formDataToRecord } from "@/lib/club-validation";
import {
  confirmSecondaryDraftPick,
  correctSecondaryDraftPick,
  draftOperatingMode,
  markSecondaryDraftPickRevealing,
  reserveSecondaryDraftPick,
  resetSecondaryDraftRehearsal,
  revealSecondaryDraftPick,
  shouldPersistOfficialAllocation,
} from "@/lib/draft-events";
import { withOrganizationContext } from "@/lib/tenant-context";

export type DraftState = { error?: string; fieldErrors?: Record<string, string[] | undefined> };
const draftSchema = z.object({ name:z.string().trim().min(2).max(100),seasonId:z.string().min(1),divisionId:z.string().min(1),tier:z.enum(DraftTier).default(DraftTier.MAIN) });
const pickSchema = z.object({ playerId:z.string().min(1),seasonClubId:z.string().min(1),round:z.coerce.number().int().min(1) });
function failure(error:unknown):DraftState { if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002")return{error:"This player or pick number has already been used."};return{error:"Draft operation failed."}; }

export async function createDraft(_s:DraftState,fd:FormData):Promise<DraftState>{
  const { organizationId } = await requirePermissionWithOrganization("draft:manage");
  const p=draftSchema.safeParse(formDataToRecord(fd));if(!p.success)return{fieldErrors:p.error.flatten().fieldErrors};
  let draftId: string;
  try{
    draftId = await withOrganizationContext(organizationId, async (tx) => {
      const valid=await tx.division.findFirst({where:{id:p.data.divisionId,competition:{seasons:{some:{id:p.data.seasonId}}}},select:{id:true}});
      if(!valid)throw new ScopeError("Division does not belong to the season competition.");
      const d=await tx.draft.create({data:{...p.data,organizationId}});
      return d.id;
    });
  }catch(e){
    if (e instanceof ScopeError) return { error: e.message };
    unstable_rethrow(e);return failure(e);
  }
  revalidatePath("/drafts");redirect(`/drafts/${draftId}`);
}
export async function setDraftStatus(draftId:string,status:DraftStatus){
  const { session, organizationId } = await requirePermissionWithOrganization("draft:manage");const now=new Date();
  await withOrganizationContext(organizationId, async tx=>{
    await tx.draft.update({where:{id:draftId},data:{status,startedAt:status==="LIVE"?now:undefined,completedAt:status==="COMPLETED"?now:null}});
    await writeAuditLog(tx,{organizationId,userId:session.user.id,action:"DRAFT_STATUS_CHANGED",entityType:"Draft",entityId:draftId,details:{status}});
  });
  revalidatePath("/drafts");revalidatePath(`/drafts/${draftId}`);
}
export async function makeDraftPick(draftId:string,_s:DraftState,fd:FormData):Promise<DraftState>{
  const { session, organizationId } = await requirePermissionWithOrganization("draft:manage");const p=pickSchema.safeParse(formDataToRecord(fd));if(!p.success)return{fieldErrors:p.error.flatten().fieldErrors};
  try{await withOrganizationContext(organizationId, async tx=>{
    const {draft,operatingMode}=await draftOperatingMode(tx,draftId);
    if(draft.status!=="LIVE")throw new Error("DRAFT_NOT_LIVE");
    const [player,team]=await Promise.all([
      tx.player.findUnique({where:{id:p.data.playerId},select:{seasonId:true,status:true,seasonClubId:true,draftSelectionGroup:true}}),
      tx.seasonClub.findUnique({where:{id:p.data.seasonClubId},select:{seasonId:true,divisionId:true,status:true}}),
    ]);
    const requiredGroup=draft.tier===DraftTier.MAIN?DraftSelectionGroup.MAIN_DRAFT:DraftSelectionGroup.SECONDARY_DRAFT;
    if(!player||player.seasonId!==draft.seasonId||!["DRAFT_ELIGIBLE","UNDRAFTED"].includes(player.status)||player.seasonClubId||player.draftSelectionGroup!==requiredGroup)throw new Error("PLAYER_INELIGIBLE");
    if(!team||team.seasonId!==draft.seasonId||team.divisionId!==draft.divisionId||team.status!=="ACTIVE")throw new Error("TEAM_INELIGIBLE");
    const pickNumber=draft.nextPickNumber;
    const persistOfficially=shouldPersistOfficialAllocation(operatingMode);
    await tx.draftPick.create({data:{organizationId,createdById:session.user.id,confirmedAt:new Date(),draftId,operatingMode,pickNumber,playerId:p.data.playerId,round:p.data.round,seasonClubId:p.data.seasonClubId,status:"CONFIRMED"}});
    if(persistOfficially){
      await tx.player.update({where:{id:p.data.playerId},data:{seasonClubId:p.data.seasonClubId,status:PlayerStatus.DRAFTED,draftedAt:new Date()}});
    }
    await tx.draft.update({where:{id:draftId},data:{currentRound:p.data.round,nextPickNumber:{increment:1}}});
    await writeAuditLog(tx,{organizationId,userId:session.user.id,action:"DRAFT_PICK_MADE",entityType:"DraftPick",entityId:`${draftId}:${pickNumber}`,details:{draftId,playerId:p.data.playerId,seasonClubId:p.data.seasonClubId,round:p.data.round,pickNumber,operatingMode,persistedOfficially:persistOfficially}});
  });revalidatePath(`/drafts/${draftId}`);return{};}catch(e){if(e instanceof Error&&e.message==="DRAFT_NOT_LIVE")return{error:"Start the draft before making a pick."};if(e instanceof Error&&e.message==="PLAYER_INELIGIBLE")return{error:"Player is not available in this draft pool."};if(e instanceof Error&&e.message==="TEAM_INELIGIBLE")return{error:"SeasonClub is not eligible for this draft."};return failure(e);}
}

// Rehearsal-safe reserve → reveal → confirm workflow. Behaves exactly like
// the Main Draft's control room actions: operatingMode is derived from the
// Draft's linked DraftEvent (or defaults to REHEARSAL if unlinked), and only
// a LIVE-governed confirm writes Player.seasonClubId.
export type SecondaryDraftPickState = { error?: string };

export async function reserveSecondaryDraftPickAction(draftId: string, _state: SecondaryDraftPickState, formData: FormData): Promise<SecondaryDraftPickState> {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:operate");
  const p = pickSchema.safeParse(formDataToRecord(formData));
  if (!p.success) return { error: "Select a player, SeasonClub, and round." };
  try {
    await reserveSecondaryDraftPick({ organizationId, draftId, playerId: p.data.playerId, round: p.data.round, seasonClubId: p.data.seasonClubId, userId: session.user.id });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not reserve pick." };
  }
  revalidatePath(`/drafts/${draftId}`);
  revalidatePath(`/drafts/${draftId}/display`);
  return {};
}

export async function startSecondaryDraftSuspenseAction(draftId: string, pickId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:reveal");
  await markSecondaryDraftPickRevealing(organizationId, pickId, session.user.id);
  revalidatePath(`/drafts/${draftId}`);
  revalidatePath(`/drafts/${draftId}/display`);
}

export async function revealSecondaryDraftPickAction(draftId: string, pickId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:reveal");
  await revealSecondaryDraftPick(organizationId, pickId, session.user.id);
  revalidatePath(`/drafts/${draftId}`);
  revalidatePath(`/drafts/${draftId}/display`);
}

export async function confirmSecondaryDraftPickAction(draftId: string, pickId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:confirm");
  await confirmSecondaryDraftPick(organizationId, pickId, session.user.id);
  revalidatePath(`/drafts/${draftId}`);
  revalidatePath(`/drafts/${draftId}/display`);
}

export async function correctSecondaryDraftPickAction(draftId: string, pickId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:correct");
  const reason = String(formData.get("reason") ?? "").trim();
  await correctSecondaryDraftPick(organizationId, pickId, session.user.id, reason);
  revalidatePath(`/drafts/${draftId}`);
  revalidatePath(`/drafts/${draftId}/display`);
}

export async function resetSecondaryDraftRehearsalAction(draftId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:correct");
  const reason = String(formData.get("reason") ?? "").trim();
  await resetSecondaryDraftRehearsal(organizationId, draftId, session.user.id, reason);
  revalidatePath(`/drafts/${draftId}`);
  revalidatePath(`/drafts/${draftId}/display`);
}

class ScopeError extends Error {}
