import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { 
  useGetTicket, 
  getGetTicketQueryKey,
  useUpdateTicket,
  useListTicketComments,
  getListTicketCommentsQueryKey,
  useCreateTicketComment,
  getListTicketsQueryKey,
  useListAgents,
  useListContacts,
  type TicketAttachment,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { TicketStatus, TicketPriority } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime, formatRelativeTime, getInitials } from "@/lib/utils";
import { ArrowLeft, Clock, Send, CheckCircle2, Lock, Globe, GitMerge, ArrowRight, Paperclip, FileText, Download, BookOpen } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { MergeTicketDialog } from "@/components/merge-ticket-dialog";
import { getMentionCandidates, replaceLastMention } from "@/lib/mentions";
import { MacroSelector } from "@/components/macro-selector";
import { useSupportUser } from "@/hooks/use-support-user";

export default function TicketDetail() {
  const [, params] = useRoute("/tickets/:id");
  const [, setLocation] = useLocation();
  const ticketId = params?.id ? parseInt(params.id) : 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useSupportUser();
  
  const { data: ticket, isLoading: isLoadingTicket } = useGetTicket(ticketId, {
    query: {
      enabled: !!ticketId,
      queryKey: getGetTicketQueryKey(ticketId)
    }
  });

  const { data: comments, isLoading: isLoadingComments } = useListTicketComments(ticketId, {
    query: {
      enabled: !!ticketId,
      queryKey: getListTicketCommentsQueryKey(ticketId)
    }
  });
  const contactsQuery = useListContacts({ limit: 200 });
  const contacts = Array.isArray(contactsQuery.data?.data) ? contactsQuery.data.data : [];
  const agentsQuery = useListAgents();

  const updateTicket = useUpdateTicket({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTicketQueryKey(ticketId) });
        queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
        toast({ title: "Ticket updated successfully" });
      }
    }
  });

  const createComment = useCreateTicketComment({
    mutation: {
      onSuccess: () => {
        setNewComment("");
        setCommentAttachments([]);
        queryClient.invalidateQueries({ queryKey: getListTicketCommentsQueryKey(ticketId) });
        toast({ title: "Comment added" });
      }
    }
  });

  const [newComment, setNewComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<TicketAttachment[]>([]);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [kbaDialogOpen, setKbaDialogOpen] = useState(false);
  const [kbaTitle, setKbaTitle] = useState("");
  const [kbaSummary, setKbaSummary] = useState("");
  const [kbaContent, setKbaContent] = useState("");
  const [isCreatingKba, setIsCreatingKba] = useState(false);
  const [isSavingAttachment, setIsSavingAttachment] = useState(false);
  const mentionSuggestions = getMentionCandidates(newComment, contacts);

  const { uploadFile, isUploading } = useUpload({
    onError: (error) => toast({ title: "Upload failed", description: error.message, variant: "destructive" }),
  });

  const handleStatusChange = (status: TicketStatus) => {
    updateTicket.mutate({ id: ticketId, data: { status } });
  };

  const handlePriorityChange = (priority: TicketPriority) => {
    updateTicket.mutate({ id: ticketId, data: { priority } });
  };

  const handleAssigneeChange = (value: string) => {
    updateTicket.mutate({
      id: ticketId,
      data: { assigneeId: value === "unassigned" ? null : Number(value) },
    });
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    createComment.mutate({
      id: ticketId,
      data: {
        body: newComment,
        isPublic: !isInternal,
        attachments: commentAttachments,
      }
    });
  };

  const handleCommentAttachment = async (file: File) => {
    setIsSavingAttachment(true);
    const uploaded = await uploadFile(file);
    setIsSavingAttachment(false);
    if (!uploaded) return;
    setCommentAttachments((current) => [
      ...current,
      {
        name: uploaded.metadata.name,
        size: uploaded.metadata.size,
        contentType: uploaded.metadata.contentType,
        objectPath: uploaded.objectPath,
        uploadedAt: new Date().toISOString(),
      },
    ]);
  };

  const openKbaDialog = () => {
    const publicReplies = Array.isArray(comments)
      ? comments.filter((comment) => comment.isPublic && comment.body.trim()).map((comment) => comment.body.trim())
      : [];
    setKbaTitle(ticket?.subject ?? "");
    setKbaSummary("");
    setKbaContent([ticket?.description?.trim(), ...publicReplies].filter(Boolean).join("\n\n"));
    setKbaDialogOpen(true);
  };

  const createKbaFromTicket = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreatingKba(true);
    try {
      const token = localStorage.getItem("userToken") || localStorage.getItem("auth_token") || localStorage.getItem("token");
      const response = await fetch("/api/knowledge-base/from-ticket", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          sourceTicketId: ticketId,
          title: kbaTitle,
          summary: kbaSummary,
          content: kbaContent,
          tags: ticket?.tags ?? [],
          status: "draft",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? `Unable to create article (${response.status})`);
      setKbaDialogOpen(false);
      toast({ title: "Knowledge article draft created" });
      setLocation(`/knowledge-base/${payload.id}`);
    } catch (error) {
      toast({
        title: "Unable to create knowledge article",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingKba(false);
    }
  };

  const handleAttachment = async (file: File) => {
    if (!ticket) return;
    setIsSavingAttachment(true);
    const uploaded = await uploadFile(file);
    if (!uploaded) {
      setIsSavingAttachment(false);
      return;
    }

    const attachment: TicketAttachment = {
      name: uploaded.metadata.name,
      size: uploaded.metadata.size,
      contentType: uploaded.metadata.contentType,
      objectPath: uploaded.objectPath,
      uploadedAt: new Date().toISOString(),
    };
    updateTicket.mutate({
      id: ticketId,
      data: { attachments: [...(ticket.attachments ?? []), attachment] },
    }, {
      onSuccess: () => toast({ title: "Attachment added" }),
      onSettled: () => setIsSavingAttachment(false),
    });
  };

  const attachmentUrl = (objectPath: string) => {
    const relativePath = objectPath.replace(/^\/objects\//, "");
    const token = localStorage.getItem("userToken") || localStorage.getItem("auth_token") || localStorage.getItem("token") || "";
    return token ? `/api/storage/objects/${relativePath}?token=${encodeURIComponent(token)}` : `/api/storage/objects/${relativePath}`;
  };

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoadingTicket) {
    return (
      <AppLayout>
        <div className="flex-1 p-8">Loading ticket...</div>
      </AppLayout>
    );
  }

  if (!ticket) {
    return (
      <AppLayout>
        <div className="flex-1 p-8 text-center text-muted-foreground">Ticket not found</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="border-b border-border bg-card px-8 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <Link href="/tickets">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">{ticket.subject}</h1>
                <Badge variant="secondary" className="font-mono text-xs">#{ticket.id}</Badge>
              </div>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <span>Created {formatRelativeTime(ticket.createdAt)}</span>
                <span>•</span>
                <span>via <span className="capitalize">{ticket.channel}</span></span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openKbaDialog}>
              <BookOpen className="mr-2 h-4 w-4" /> Create KBA
            </Button>
            {ticket.status !== 'solved' && ticket.status !== 'closed' && !ticket.mergedIntoId && (
              <>
                <Button
                  onClick={() => setMergeDialogOpen(true)}
                  variant="outline"
                  className="text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950"
                >
                  <GitMerge className="mr-2 h-4 w-4" /> Merge
                </Button>
                <Button onClick={() => handleStatusChange('solved')} variant="outline" className="text-green-600 hover:text-green-700 hover:bg-green-50">
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Mark as Solved
                </Button>
              </>
            )}
          </div>
        </div>

        <Dialog open={kbaDialogOpen} onOpenChange={setKbaDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create knowledge article from ticket #{ticket.id}</DialogTitle>
              <DialogDescription>
                Review and edit the draft before saving. Only the ticket description and public replies are included; internal notes are excluded.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={createKbaFromTicket}>
              <div className="space-y-2">
                <Label htmlFor="ticket-kba-title">Title</Label>
                <Input id="ticket-kba-title" required maxLength={200} value={kbaTitle} onChange={(event) => setKbaTitle(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-kba-summary">Summary</Label>
                <Input id="ticket-kba-summary" maxLength={500} value={kbaSummary} onChange={(event) => setKbaSummary(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-kba-content">Article content</Label>
                <Textarea id="ticket-kba-content" className="min-h-56" required maxLength={50000} value={kbaContent} onChange={(event) => setKbaContent(event.target.value)} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setKbaDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isCreatingKba}>{isCreatingKba ? "Creating..." : "Save as draft"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Merged-into banner */}
        {ticket.mergedIntoId && (
          <div className="bg-violet-50 dark:bg-violet-950/40 border-b border-violet-200 dark:border-violet-800 px-8 py-3 flex items-center gap-3">
            <GitMerge className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
            <span className="text-sm text-violet-800 dark:text-violet-200">
              This ticket was merged into{" "}
              <Link href={`/tickets/${ticket.mergedIntoId}`} className="font-semibold underline hover:no-underline">
                Ticket #{ticket.mergedIntoId}
              </Link>
              {" "}and is now closed.
            </span>
            <Link href={`/tickets/${ticket.mergedIntoId}`}>
              <Button size="sm" variant="outline" className="ml-auto border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900">
                View Target <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main Column */}
          <div className="flex-1 overflow-y-auto p-8 flex flex-col">
            <div className="flex-1 space-y-6 max-w-3xl">
              {/* Original Description */}
              <div className="flex gap-4">
                <Avatar className="h-10 w-10 border mt-1">
                  <AvatarFallback className="bg-primary/10">
                    {ticket.requester ? getInitials(ticket.requester.name) : "U"}
                  </AvatarFallback>
                </Avatar>
                <Card className="flex-1">
                  <CardHeader className="py-3 px-4 bg-muted/30 border-b border-border">
                    <div className="flex justify-between items-center">
                      <div className="font-medium text-sm">
                        {ticket.requester?.name || "Unknown User"} 
                        <span className="text-muted-foreground font-normal ml-2">reported an issue</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(ticket.createdAt)}</div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 text-sm whitespace-pre-wrap">
                    {ticket.description || "No description provided."}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="py-3 px-4 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium text-sm"><Paperclip className="h-4 w-4 text-muted-foreground" /> Attachments</div>
                    <label className="cursor-pointer">
                      <Button asChild size="sm" variant="outline" disabled={isUploading || isSavingAttachment}>
                        <span><Paperclip className="mr-2 h-3.5 w-3.5" /> {isUploading || isSavingAttachment ? "Uploading..." : "Add file"}</span>
                      </Button>
                      <input
                        type="file"
                        className="sr-only"
                        disabled={isUploading || isSavingAttachment}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.currentTarget.value = "";
                          if (file) void handleAttachment(file);
                        }}
                      />
                    </label>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  {ticket.attachments?.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {ticket.attachments.map((attachment) => (
                        <a
                          key={`${attachment.objectPath}-${attachment.uploadedAt}`}
                          href={attachmentUrl(attachment.objectPath)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50"
                        >
                          <FileText className="h-8 w-8 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{attachment.name}</span>
                            <span className="text-xs text-muted-foreground">{formatFileSize(attachment.size)} · {attachment.contentType}</span>
                          </span>
                          <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No files attached yet.</p>
                  )}
                </CardContent>
              </Card>

              {/* Comments Thread */}
              {isLoadingComments ? (
                <div className="text-center py-4 text-sm text-muted-foreground">Loading conversation...</div>
              ) : (
                <div className="space-y-6">
                  {comments?.map((comment) => (
                    <div key={comment.id} className="flex gap-4">
                      <Avatar className="h-10 w-10 border mt-1">
                        <AvatarFallback className={comment.authorRole === 'agent' || comment.authorRole === 'admin' ? "bg-primary text-primary-foreground" : "bg-primary/10"}>
                          {comment.authorName ? getInitials(comment.authorName) : "U"}
                        </AvatarFallback>
                      </Avatar>
                      <Card className={`flex-1 ${!comment.isPublic ? 'border-yellow-200 bg-yellow-50/30 dark:border-yellow-900/50 dark:bg-yellow-900/10' : ''}`}>
                        <CardHeader className={`py-3 px-4 border-b border-border ${!comment.isPublic ? 'bg-yellow-100/50 dark:bg-yellow-900/20' : 'bg-muted/30'}`}>
                          <div className="flex justify-between items-center">
                            <div className="font-medium text-sm flex items-center gap-2">
                              {comment.authorName || "Unknown"}
                              {comment.authorRole && (comment.authorRole === 'agent' || comment.authorRole === 'admin') && (
                                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">Support</Badge>
                              )}
                              {!comment.isPublic && (
                                <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-200 dark:border-yellow-800">
                                  <Lock className="w-3 h-3 mr-1" /> Internal Note
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 text-sm whitespace-pre-wrap">
                          {comment.body}
                          {comment.attachments?.length > 0 && (
                            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                              {comment.attachments.map((attachment) => (
                                <a
                                  key={`${attachment.objectPath}-${attachment.uploadedAt}`}
                                  href={attachmentUrl(attachment.objectPath)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-2 rounded-md border bg-background p-2 text-sm transition-colors hover:bg-muted/50"
                                >
                                  <FileText className="h-5 w-5 shrink-0 text-primary" />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium">{attachment.name}</span>
                                    <span className="block truncate text-xs text-muted-foreground">
                                      {formatFileSize(attachment.size)} · {attachment.contentType}
                                    </span>
                                  </span>
                                  <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                                </a>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Comment Input */}
              <div className="mt-8">
                <Card>
                  <div className="flex border-b border-border">
                    <button 
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${!isInternal ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                      onClick={() => setIsInternal(false)}
                    >
                      <Globe className="h-4 w-4" /> Public Reply
                    </button>
                    <button 
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${isInternal ? 'border-yellow-500 text-yellow-600 dark:text-yellow-500' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                      onClick={() => setIsInternal(true)}
                    >
                      <Lock className="h-4 w-4" /> Internal Note
                    </button>
                  </div>
                  <div className={`p-4 ${isInternal ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : ''}`}>
                    <div className="space-y-2">
                      <Textarea 
                        placeholder={isInternal ? "Add an internal note (only visible to agents)... @name or @email" : "Type your reply to the customer... @name or @email"}
                        className={`min-h-[120px] resize-y ${isInternal ? 'border-yellow-200 focus-visible:ring-yellow-500 dark:border-yellow-900/50' : ''}`}
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                      />
                      <MacroSelector
                        scope={isInternal ? "internal_comment" : "public_comment"}
                        context={{ ticket, user }}
                        ticketId={ticketId}
                        userId={user?.id}
                        onInsert={(content) => setNewComment((current) => current ? `${current}\n\n${content}` : content)}
                      />
                      {mentionSuggestions.length > 0 && (
                        <div className="rounded-md border bg-muted/20 p-2">
                          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Mention a contact</p>
                          <div className="flex flex-wrap gap-2">
                            {mentionSuggestions.map((contact) => (
                              <button
                                key={contact.id}
                                type="button"
                                className="rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-accent"
                                onClick={() => setNewComment((current) => replaceLastMention(current, contact))}
                              >
                                {contact.name} · {contact.email}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {commentAttachments.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {commentAttachments.map((attachment, index) => (
                          <div key={`${attachment.objectPath}-${attachment.uploadedAt}`} className="flex items-center gap-2 rounded-md border bg-background p-2 text-sm">
                            <FileText className="h-4 w-4 shrink-0 text-primary" />
                            <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                            <span className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-muted-foreground"
                              onClick={() => setCommentAttachments((current) => current.filter((_, attachmentIndex) => attachmentIndex !== index))}
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-between items-center mt-4">
                      <div className="text-xs text-muted-foreground">
                        {isInternal ? "This note will not be visible to the customer." : "The customer will receive an email notification."}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer">
                          <Button asChild type="button" variant="outline" size="sm" disabled={isUploading || isSavingAttachment || createComment.isPending}>
                            <span><Paperclip className="mr-2 h-3.5 w-3.5" /> {isUploading || isSavingAttachment ? "Uploading..." : "Attach file"}</span>
                          </Button>
                          <input
                            type="file"
                            className="sr-only"
                            disabled={isUploading || isSavingAttachment || createComment.isPending}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.currentTarget.value = "";
                              if (file) void handleCommentAttachment(file);
                            }}
                          />
                        </label>
                        <Button
                          onClick={handleAddComment}
                          disabled={createComment.isPending || !newComment.trim() || isUploading || isSavingAttachment}
                          className={isInternal ? "bg-yellow-600 hover:bg-yellow-700 text-white" : ""}
                        >
                          {createComment.isPending ? "Sending..." : "Submit"} <Send className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="w-80 border-l border-border bg-muted/10 p-6 flex flex-col gap-6 overflow-y-auto">
            {/* Properties */}
            <div className="space-y-4">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Ticket Details</h3>
              
              <div className="space-y-3">
                <div className="grid grid-cols-3 items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Select value={ticket.status} onValueChange={(v) => handleStatusChange(v as TicketStatus)}>
                    <SelectTrigger className="col-span-2 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                      <SelectItem value="solved">Solved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-3 items-center gap-2">
                  <span className="text-sm text-muted-foreground">Priority</span>
                  <Select value={ticket.priority} onValueChange={(v) => handlePriorityChange(v as TicketPriority)}>
                    <SelectTrigger className="col-span-2 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-3 items-center gap-2">
                  <span className="text-sm text-muted-foreground">Type</span>
                  <div className="col-span-2 text-sm capitalize">{ticket.type}</div>
                </div>

                <div className="grid grid-cols-3 items-center gap-2">
                  <span className="text-sm text-muted-foreground">Channel</span>
                  <div className="col-span-2 text-sm capitalize">{ticket.channel}</div>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-border">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Template installation details</h3>
              <div className="space-y-2">
                {[
                  ["Fleet Num", ticket.fleetNum],
                  ["Reg", ticket.reg],
                  ["VIN", ticket.vin],
                  ["Engine", ticket.engine],
                  ["Make", ticket.make],
                  ["Model", ticket.model],
                  ["Colour", ticket.colour],
                  ["ODO", ticket.odo],
                  ["Device ID", ticket.deviceId],
                  ["Device Cell No", ticket.deviceCellNo],
                  ["Device Type", ticket.deviceType],
                  ["Tracking IMEI", ticket.trackingImei],
                  ["Tracking Cell Num", ticket.trackingCellNum],
                  ["Tracking Type", ticket.trackingType],
                  ["VESA NUM", ticket.vesaNum],
                  ["HOURS", ticket.hours],
                ].map(([label, value]) => value ? (
                  <div key={label} className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium break-words">{value}</span>
                  </div>
                ) : null)}
              </div>
            </div>

            {/* People */}
            <div className="space-y-4 pt-4 border-t border-border">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">People</h3>
              
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">Requester</div>
                  {ticket.requester ? (
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{getInitials(ticket.requester.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <Link href={`/contacts/${ticket.requester.id}`} className="text-sm font-medium hover:underline block">
                          {ticket.requester.name}
                        </Link>
                        <a href={`mailto:${ticket.requester.email}`} className="text-xs text-muted-foreground hover:underline">
                          {ticket.requester.email}
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground italic">None</div>
                  )}
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">Assignee</div>
                  <Select
                    value={ticket.assigneeId == null ? "unassigned" : String(ticket.assigneeId)}
                    onValueChange={handleAssigneeChange}
                    disabled={agentsQuery.isLoading || updateTicket.isPending}
                  >
                    <SelectTrigger className="w-full h-9 text-sm">
                      <SelectValue placeholder={agentsQuery.isLoading ? "Loading agents..." : "Select assignee"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {agentsQuery.data?.map((agent) => (
                        <SelectItem key={agent.id} value={String(agent.id)}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {agentsQuery.isError && (
                    <div className="text-xs text-destructive mt-1.5">
                      Agents could not be loaded. Refresh and try again.
                    </div>
                  )}
                </div>

                {ticket.organization && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1.5">Organization</div>
                    <Link href={`/organizations/${ticket.organization.id}`} className="text-sm font-medium hover:underline flex items-center gap-2">
                      <Globe className="h-3 w-3" /> {ticket.organization.name}
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Time & SLAs */}
            <div className="space-y-4 pt-4 border-t border-border">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Dates & SLA</h3>
              
              <div className="space-y-3">
                {ticket.dueAt && (
                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="text-xs font-medium">Due Date</div>
                      <div className="text-sm">{formatDateTime(ticket.dueAt)}</div>
                    </div>
                  </div>
                )}
                
                <div className="flex items-start gap-2">
                  <div className="h-4 w-4 rounded-full border flex items-center justify-center mt-0.5">
                    <div className="h-1.5 w-1.5 bg-muted-foreground rounded-full"></div>
                  </div>
                  <div>
                    <div className="text-xs font-medium">Created</div>
                    <div className="text-sm text-muted-foreground">{formatDateTime(ticket.createdAt)}</div>
                  </div>
                </div>

                {ticket.resolvedAt && (
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                    <div>
                      <div className="text-xs font-medium text-green-600 dark:text-green-500">Resolved</div>
                      <div className="text-sm text-muted-foreground">{formatDateTime(ticket.resolvedAt)}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
      <MergeTicketDialog
        open={mergeDialogOpen}
        onOpenChange={setMergeDialogOpen}
        sourceTicketId={ticketId}
        sourceSubject={ticket.subject}
      />
    </AppLayout>
  );
}
