package com.example.ebookreader.controller;

import com.example.ebookreader.dto.EbookDto;
import com.example.ebookreader.service.EpubParserService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin(origins = "http://localhost:5173")
public class EbookController {

    private final EpubParserService epubParserService;

    public EbookController(EpubParserService epubParserService) {
        this.epubParserService = epubParserService;
    }

    @GetMapping("api/book/info")
    public EbookDto getBookInfo() {
        String filepath = "C:/Users/UTTARAN/Projects/ebookreader/ebookreader-backend/test-books/Verne, Jules - Around the World in Eighty Days.epub";
        return epubParserService.parseEpub(filepath);
    }

    @GetMapping("api/book/chapter")
    public String getChapter(@RequestParam String chapterPath) {
        String filePath = "C:/Users/UTTARAN/Projects/ebookreader/ebookreader-backend/test-books/Verne, Jules - Around the World in Eighty Days.epub";
        return epubParserService.getChapterContent(filePath, chapterPath);
    }

    @GetMapping("api/book/asset")
    public ResponseEntity<byte[]> getBookAsset(@RequestParam String assetPath) {
        String filePath = "C:/Users/UTTARAN/Projects/ebookreader/ebookreader-backend/test-books/Verne, Jules - Around the World in Eighty Days.epub";
        byte[] data = epubParserService.getAsset(filePath, assetPath);
        if (data == null) return ResponseEntity.notFound().build();

        MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM;
        String lowerPath = assetPath.toLowerCase();
        if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) mediaType = MediaType.IMAGE_JPEG;
        else if (lowerPath.endsWith(".png")) mediaType = MediaType.IMAGE_PNG;
        else if (lowerPath.endsWith(".css")) mediaType = MediaType.valueOf("text/css");
        return ResponseEntity.ok().contentType(mediaType).body(data);
    }
}
