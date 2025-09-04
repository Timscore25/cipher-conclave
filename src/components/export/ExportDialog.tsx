import { useState } from 'react';
import { Download, FileText, Copy, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { Message } from '@/lib/stores/messages-store';
import { useToast } from '@/hooks/use-toast';

interface ExportDialogProps {
  message: Message;
  children: React.ReactNode;
}

export function ExportDialog({ message, children }: ExportDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const generateArmoredBlock = () => {
    const envelope = JSON.stringify(message.envelope, null, 2);
    const ciphertextBase64 = btoa(String.fromCharCode(...message.ciphertext));
    
    const armoredBlock = `-----BEGIN PGP MESSAGE-----
Comment: Encrypted with PGPRooms - https://pgprooms.com
Comment: Use GnuPG to decrypt this message

${envelope}

${ciphertextBase64}
-----END PGP MESSAGE-----`;

    return armoredBlock;
  };

  const armoredText = generateArmoredBlock();

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(armoredText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied to clipboard",
      description: "Encrypted message copied as ASCII-armored block.",
    });
  };

  const downloadFile = () => {
    const blob = new Blob([armoredText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `message-${message.id.substring(0, 8)}.asc`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "File downloaded",
      description: "Encrypted message saved as .asc file.",
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Download className="w-5 h-5" />
            <span>Export Message</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Message Info */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Message Details</span>
              <Badge variant="secondary">
                <FileText className="w-3 h-3 mr-1" />
                ASCII Armored
              </Badge>
            </div>
            
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>From:</strong> {message.devices?.label || 'Unknown Device'}</p>
              <p><strong>Date:</strong> {formatDate(message.created_at)}</p>
              <p><strong>Signature:</strong> {message.signer_fpr.substring(0, 16)}...</p>
              {message.envelope.hasAttachments && (
                <p><strong>Attachments:</strong> {message.envelope.attachmentKeys?.length || 0} files</p>
              )}
            </div>
          </div>

          {/* ASCII Armored Block */}
          <div className="space-y-2">
            <label className="text-sm font-medium">ASCII-Armored Block</label>
            <Textarea
              value={armoredText}
              readOnly
              className="font-mono text-xs h-64 resize-none"
            />
            <p className="text-xs text-muted-foreground">
              This block can be decrypted with GnuPG or other OpenPGP-compatible tools
            </p>
          </div>

          {/* Usage Instructions */}
          <div className="p-3 bg-muted rounded-lg">
            <h4 className="text-sm font-medium mb-2">Decrypt with GnuPG:</h4>
            <code className="text-xs block bg-background p-2 rounded border">
              gpg --decrypt message.asc
            </code>
          </div>

          {/* Actions */}
          <div className="flex space-x-2">
            <Button variant="outline" onClick={copyToClipboard} className="flex-1">
              {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            <Button onClick={downloadFile} className="flex-1">
              <Download className="w-4 h-4 mr-2" />
              Download .asc
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}