"""Read phonemes back from the Flite voice (ctypes). Usage: python3 phones.py Ashurbanipal Nineveh

Used to check how the demonstration voice will say hard words, because no one can listen during the build.
"""
import ctypes, sys, json
L=lambda n: ctypes.CDLL(f"/usr/lib/x86_64-linux-gnu/{n}")
flite=L("libflite.so.1")
us=L("libflite_usenglish.so.1"); lex=L("libflite_cmulex.so.1"); slt=L("libflite_cmu_us_slt.so.1")
flite.flite_init()
us.usenglish_init.argtypes=[ctypes.c_void_p]; 
slt.register_cmu_us_slt.restype=ctypes.c_void_p
voice=slt.register_cmu_us_slt(None)
flite.flite_synth_text.restype=ctypes.c_void_p; flite.flite_synth_text.argtypes=[ctypes.c_char_p,ctypes.c_void_p]
flite.utt_relation.restype=ctypes.c_void_p; flite.utt_relation.argtypes=[ctypes.c_void_p,ctypes.c_char_p]
flite.relation_head.restype=ctypes.c_void_p; flite.relation_head.argtypes=[ctypes.c_void_p]
flite.item_next.restype=ctypes.c_void_p; flite.item_next.argtypes=[ctypes.c_void_p]
flite.item_feat_string.restype=ctypes.c_char_p; flite.item_feat_string.argtypes=[ctypes.c_void_p,ctypes.c_char_p]
def phones(text):
    u=flite.flite_synth_text(text.encode(),voice)
    r=flite.utt_relation(u,b"Segment"); it=flite.relation_head(r); out=[]
    while it:
        out.append(flite.item_feat_string(it,b"name").decode()); it=flite.item_next(it)
    return " ".join(out)
if __name__=="__main__":
    for w in sys.argv[1:]: print(w,"->",phones(w))
