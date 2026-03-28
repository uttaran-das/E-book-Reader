package com.example.ebookreader.controller;

import com.example.ebookreader.dto.EbookDto;
import com.example.ebookreader.service.EpubParserService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.HashMap;

@RestController
@CrossOrigin(origins = "http://localhost:5173")
public class EbookController {

    private final EpubParserService epubParserService;

    public EbookController(EpubParserService epubParserService) {
        this.epubParserService = epubParserService;
    }

    @GetMapping("/api/book/info")
    public EbookDto getBookInfo(@RequestParam String bookId) {
        return epubParserService.parseEpub(bookId);
    }

    @GetMapping("/api/book/chapter")
    public String getChapter(@RequestParam String bookId, @RequestParam String chapterPath) {
        return epubParserService.getChapterContent(bookId, chapterPath);
    }

    @GetMapping("/api/book/asset")
    public ResponseEntity<byte[]> getBookAsset(@RequestParam String bookId, @RequestParam String assetPath) {
        byte[] data = epubParserService.getAsset(bookId, assetPath);
        if (data == null) return ResponseEntity.notFound().build();

        MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM;
        String lowerPath = assetPath.toLowerCase();
        if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) mediaType = MediaType.IMAGE_JPEG;
        else if (lowerPath.endsWith(".png")) mediaType = MediaType.IMAGE_PNG;
        else if (lowerPath.endsWith(".css")) mediaType = MediaType.valueOf("text/css");
        return ResponseEntity.ok().contentType(mediaType).body(data);
    }

    @PostMapping("/api/book/upload")
    public ResponseEntity<HashMap<String, String>> uploadBook(@RequestParam("file") MultipartFile file) {
        try {
            String bookId = epubParserService.uploadBook(file);
            HashMap<String, String> response = new HashMap<>();
            response.put("bookId", bookId);
            return ResponseEntity.ok(response);
        } catch (IOException e) {
            return ResponseEntity.internalServerError().build();
        }
    }
}
